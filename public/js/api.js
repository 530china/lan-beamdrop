export const apiConfig = {
  baseUrl: '/api'
};

export const fetchFiles = () => fetch(`${apiConfig.baseUrl}/files`);

export const fetchClipboard = () => fetch(`${apiConfig.baseUrl}/clipboard`);

export const deleteFile = (files) => fetch(`${apiConfig.baseUrl}/files/batch-delete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ files })
});

export async function uploadFileChunked(file, onProgress, onAbort) {
  const CHUNK_SIZE = 2 * 1024 * 1024;
  const MAX_CONCURRENCY = 3;
  const MAX_RETRIES = 3;
  
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
  const fileName = file.name;
  const fileId = `${fileName}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  const abortController = new AbortController();
  if (onAbort) {
    onAbort(() => abortController.abort());
  }

  let bytesUploaded = 0;
  let hasError = false;

  async function uploadChunkWithRetry(chunkIndex, blob) {
    let retries = 0;
    while (retries <= MAX_RETRIES) {
      if (hasError || abortController.signal.aborted) return;
      try {
        const formData = new FormData();
        formData.append('chunk', blob);
        formData.append('filename', fileName);
        formData.append('fileId', fileId);
        formData.append('index', chunkIndex);
        formData.append('totalChunks', totalChunks);

        const res = await fetch(`${apiConfig.baseUrl}/files/chunk`, {
          method: 'POST',
          body: formData,
          signal: abortController.signal
        });

        if (!res.ok) {
          throw new Error(`Chunk ${chunkIndex} upload failed with status ${res.status}`);
        }
        
        bytesUploaded += blob.size;
        if (onProgress) {
          onProgress(bytesUploaded, file.size);
        }
        return;
      } catch (err) {
        if (abortController.signal.aborted) {
          throw err;
        }
        retries++;
        if (retries > MAX_RETRIES) {
          hasError = true;
          throw err;
        }
      }
    }
  }

  let currentChunk = 0;
  const workers = Array(MAX_CONCURRENCY).fill(null).map(async () => {
    while (currentChunk < totalChunks && !hasError && !abortController.signal.aborted) {
      const chunkIndex = currentChunk++;
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const blob = file.slice(start, end);
      await uploadChunkWithRetry(chunkIndex, blob);
    }
  });

  try {
    await Promise.all(workers);
  } catch (err) {
    hasError = true;
    throw err;
  } finally {
    if (hasError || abortController.signal.aborted) {
      fetch(`${apiConfig.baseUrl}/files/cancel-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId })
      }).catch(err => console.warn('Cancel upload cleanup failed:', err));
    }
  }

  if (hasError) {
    throw new Error('File upload failed after retries.');
  }

  if (abortController.signal.aborted) {
    const err = new Error('AbortError');
    err.name = 'AbortError';
    throw err;
  }

  const mergeRes = await fetch(`${apiConfig.baseUrl}/files/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, filename: fileName, totalChunks }),
    signal: abortController.signal
  });

  if (!mergeRes.ok) {
    throw new Error('Merge request failed');
  }
}

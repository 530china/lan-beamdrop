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

/**
 * ConcurrencyQueue
 * A generic queue to limit the number of concurrent asynchronous tasks.
 */
export class ConcurrencyQueue {
  constructor(maxConcurrency = 2) {
    this.maxConcurrency = maxConcurrency;
    this.activeCount = 0;
    this.tasks = new Map(); // id -> { id, data, status, startFn }
  }

  addTask(id, taskData, startFn) {
    const task = {
      id,
      data: taskData,
      status: 'waiting',
      startFn
    };
    this.tasks.set(id, task);
    this.process();
    return task;
  }

  process() {
    if (this.activeCount >= this.maxConcurrency) {
      return;
    }

    let nextTask = null;
    let oldestTime = null;

    // Find the oldest waiting task by timestamp
    this.tasks.forEach(task => {
      if (task.status === 'waiting') {
        const time = task.data.timestamp ? new Date(task.data.timestamp).getTime() : 0;
        if (oldestTime === null || time < oldestTime) {
          oldestTime = time;
          nextTask = task;
        }
      }
    });

    if (nextTask) {
      nextTask.status = 'uploading';
      this.activeCount++;

      // Trigger status change callback if provided
      if (nextTask.data.onStatusChange) {
        nextTask.data.onStatusChange('uploading');
      }

      let promise;
      try {
        promise = nextTask.startFn();
      } catch (err) {
        promise = Promise.reject(err);
      }

      promise
        .then(() => {
          this.activeCount--;
          nextTask.status = 'done';
          this.tasks.delete(nextTask.id);
          this.process();
        })
        .catch(() => {
          this.activeCount--;
          nextTask.status = 'error';
          this.tasks.delete(nextTask.id);
          this.process();
        });
    }
  }

  cancelTask(id) {
    const task = this.tasks.get(id);
    if (!task) return;

    if (task.status === 'uploading') {
      this.activeCount--;
    }
    this.tasks.delete(id);
    this.process();
  }

  getTask(id) {
    return this.tasks.get(id);
  }

  clear() {
    this.tasks.clear();
    this.activeCount = 0;
  }
}

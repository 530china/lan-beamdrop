const fs = require('fs');
const path = require('path');

// Dynamically load and evaluate the ES6 ConcurrencyQueue class in standard Node environment
const queueCode = fs.readFileSync(path.join(__dirname, '../../public/js/queue.js'), 'utf8');
const cleanCode = queueCode.replace(/export\s+class\s+/, 'class ');
const ConcurrencyQueue = eval(`(function() {
  ${cleanCode};
  return ConcurrencyQueue;
})()`);

describe('ConcurrencyQueue (Frontend Concurrency Control)', () => {
  let queue;

  beforeEach(() => {
    queue = new ConcurrencyQueue(2); // Limit to 2 concurrent tasks
  });

  test('should limit concurrent tasks to maxConcurrency', async () => {
    let runCount = 0;
    const taskPromises = [];
    const resolvers = [];

    const createTask = (id) => {
      let resolveFn;
      const promise = new Promise((resolve) => { resolveFn = resolve; });
      resolvers.push(resolveFn);

      queue.addTask(id, { timestamp: new Date().toISOString() }, () => {
        runCount++;
        return promise;
      });
      taskPromises.push(promise);
    };

    // Add 3 tasks
    createTask('task1');
    createTask('task2');
    createTask('task3');

    // Only 2 tasks should be running concurrently
    expect(runCount).toBe(2);
    expect(queue.activeCount).toBe(2);
    expect(queue.getTask('task1').status).toBe('uploading');
    expect(queue.getTask('task2').status).toBe('uploading');
    expect(queue.getTask('task3').status).toBe('waiting');

    // Resolve task 1
    resolvers[0]();
    await new Promise(process.nextTick); // Wait for microtasks to resolve

    // Task 3 should now start running
    expect(runCount).toBe(3);
    expect(queue.activeCount).toBe(2);
    expect(queue.getTask('task1')).toBeUndefined(); // Completed task is deleted
    expect(queue.getTask('task3').status).toBe('uploading');

    // Resolve task 2 and 3
    resolvers[1]();
    resolvers[2]();
    await new Promise(process.nextTick);

    expect(queue.activeCount).toBe(0);
  });

  test('should schedule next task when a task fails', async () => {
    let runCount = 0;
    let rejectTask;
    const promise = new Promise((_, reject) => { rejectTask = reject; });

    queue.addTask('task1', {}, () => {
      runCount++;
      return promise;
    });

    queue.addTask('task2', {}, () => {
      runCount++;
      return Promise.resolve();
    });

    expect(runCount).toBe(2);

    // Fail task 1
    rejectTask(new Error('fail'));
    await new Promise(process.nextTick);

    // Concurrency queue should recover, clean task 1, and active count should be 0
    expect(queue.activeCount).toBe(0);
    expect(queue.getTask('task1')).toBeUndefined();
  });

  test('should handle task cancellation correctly', async () => {
    let runCount = 0;
    const p1 = new Promise(() => {});
    const p2 = new Promise(() => {});
    const p3 = new Promise(() => {});

    queue.addTask('task1', {}, () => { runCount++; return p1; });
    queue.addTask('task2', {}, () => { runCount++; return p2; });
    queue.addTask('task3', {}, () => { runCount++; return p3; });

    expect(runCount).toBe(2);
    expect(queue.getTask('task3').status).toBe('waiting');

    // Cancel waiting task 3
    queue.cancelTask('task3');
    expect(queue.getTask('task3')).toBeUndefined();
    expect(queue.activeCount).toBe(2);

    // Cancel running task 1
    queue.cancelTask('task1');
    expect(queue.getTask('task1')).toBeUndefined();
    expect(queue.activeCount).toBe(1);
  });
});

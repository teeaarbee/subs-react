class WorkerPool {
  constructor(size, timeout = 30000) {
    this.tasks = [];
    this.workers = new Array(size).fill(null);
    this.timeout = timeout;
  }

  async execute(task) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Task timeout'));
      }, this.timeout);

      this.tasks.push({
        task,
        resolve: (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      });
      this.runNext();
    });
  }

  async runNext() {
    if (this.tasks.length === 0) return;

    const workerIndex = this.workers.findIndex(worker => worker === null);
    if (workerIndex === -1) return;

    const { task, resolve, reject } = this.tasks.shift();
    this.workers[workerIndex] = task;

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.workers[workerIndex] = null;
      this.runNext();
    }
  }
}

export default WorkerPool; 
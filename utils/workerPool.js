class WorkerPool {
  constructor(size) {
    this.tasks = [];
    this.workers = new Array(size).fill(null);
  }

  async execute(task) {
    return new Promise((resolve, reject) => {
      this.tasks.push({ task, resolve, reject });
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
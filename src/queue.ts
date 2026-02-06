type Job = {
  sku: string;
  broadcastCount: number;
  tx: string;
};

const queue: Job[] = [];

export function pushJob(job: Job) {
  queue.push(job);
}

export function popJob(): Job | undefined {
  return queue.shift();
}

export function queueSize() {
  return queue.length;
}

export default { pushJob, popJob, queueSize };

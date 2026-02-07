type Job = {
    sku: string;
    broadcastCount: number;
    tx: string;
};
export declare function pushJob(job: Job): void;
export declare function popJob(): Job | undefined;
export declare function queueSize(): number;
declare const _default: {
    pushJob: typeof pushJob;
    popJob: typeof popJob;
    queueSize: typeof queueSize;
};
export default _default;
//# sourceMappingURL=queue.d.ts.map
export declare function updateInventoryOnAmazon(sku: string, quantity: number, tx?: string): Promise<{
    ok: boolean;
    sku: string;
    quantity: number;
    tx?: string;
}>;
declare const _default: {
    updateInventoryOnAmazon: typeof updateInventoryOnAmazon;
};
export default _default;
//# sourceMappingURL=amazonClient.d.ts.map
import { flatMap, last } from './utils';

export interface IParentLookup<TKey, TValue> {
    get(key: TKey): TValue | undefined;
    getAll(key: TKey): TValue[];
}

export class Lookup<TKey, TValue> implements IParentLookup<TKey, TValue> {
    private parent: IParentLookup<TKey, TValue>;
    private map = new Map<TKey, TValue[]>();

    constructor(initialEntries: [TKey, TValue][] = [], parent?: IParentLookup<TKey, TValue>) {
        this.parent = parent || { get(key: TKey) { return undefined; }, getAll(key: TKey) { return []; } };
        initialEntries.forEach(([key, value]) => this.add(key, value));
    }

    add(key: TKey, value: TValue) {
        let values = this.map.get(key);
        if (values == null)
            this.map.set(key, values = []);
        values.push(value);
        return value;
    }

    remove(key: TKey, value: TValue) {
        let values = this.map.get(key) || [];
        let i = values.indexOf(value);
        if (i >= 0)
            values.splice(i, 1);
    }

    get(key: TKey): TValue | undefined {
        let values = key ? this.map.get(key) : null;
        return values != null
            ? last(values)
            : this.parent.get(key);
    }

    getAll(key: TKey): TValue[] {
        return this.parent.getAll(key).concat(this.map.get(key) || []);
    }

    values() {
        return flatMap(Array.from(this.map.values()), vs => vs);
    }
}

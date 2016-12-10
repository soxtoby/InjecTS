import { isFunction } from './types';

export function flatMap<TIn, TOut>(array: TIn[], mapFn: (item: TIn) => TOut[]): TOut[] {
    return Array.prototype.concat.apply([], array.map(mapFn));
}

export function last<T>(array: T[]): T {
    return array[array.length - 1];
}

export function name(key: any) {
    return isFunction(key)
        ? key.name || "Type"
        : "'" + String(key) + "'";
}

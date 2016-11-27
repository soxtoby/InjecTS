export type Constructor<T> = Function & ({ new (...args: any[]): T } | { prototype: T });
export type Func<T> = (...args: any[]) => T;

export interface IDisposable {
    dispose(): void;
}

export function isDisposable(value: any): value is IDisposable {
    return value
        && isFunction(value.dispose);
}

export function isFunction(fn: any): fn is Function {
    return typeof fn == 'function';
}

export function notDefined(value: any): value is undefined {
    return !isDefined(value);
}

export function isDefined(value: any) {
    return typeof value != 'undefined';
}

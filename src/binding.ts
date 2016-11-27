import { Func, isFunction, Constructor, notDefined, isDefined } from './types';
import { Container } from './container';
import { Scope } from './scope';
import { dependant, getDependencies, Dependency } from './dependencies';
import { Locals } from './locals';

export type BindableKey = string | symbol | Constructor<any>;

export class Binding<T> {
    private constructor(
        private readonly _keys: BindableKey[],
        private readonly _factory: Func<T>,
        private readonly _lifeTime: (factory: Func<T>, registeredResolve: Container, registeredScope: Scope, resolve: Container, currentScope: Scope) => T) {
    }

    static from(keys: BindableKey[]) {
        let invalidKeys = keys.filter(k => !isBindableKey(k));
        if (invalidKeys.length)
            throw new Error(String(invalidKeys[0]) + " is not a valid key to bind to");

        let factory = keys.length == 1 && isFunction(keys[0])
            ? constructor(keys[0] as Constructor<any>)
            : () => { throw new Error("No factory for binding"); };
        let binding = new Binding(keys, factory, (f, rr, rs, r, s) => { throw new Error() });
        return keys.length
            ? binding.perContainer()
            : binding.perDependency();
    }

    get keys() { return this._keys; }

    to(factory: (container: Container) => T) {
        verifyIsFunction(factory, "Factory");
        return this.withFactory(() => dependant([Container], (c: Container) => factory(c)));
    }

    withFactory(wrapFactory: (innerFactory: Func<T>) => Func<T>) {
        return new Binding<T>(this._keys, wrapFactory(this._factory), this._lifeTime);
    }

    toType(type: Constructor<T>) {
        verifyIsFunction(type, "Constructor");
        return this.withFactory(() => constructor(type))
    }

    toValue(value: T) {
        if (notDefined(value))
            throw new Error("Value is undefined");
        return new Binding<T>(this._keys, () => value, factory => factory());
    }

    toFunction(fn: Func<any>) {
        if (this.keys.some(k => isFunction(k)))
            throw new Error("Only strings and symbols can be bound to functions");
        return this.withFactory(() => dependant([Container, Locals], (c: Container, local: Locals) => c.resolveFunction(fn, local.keys, local.values) as any as T));
    }

    once(): Binding<T> {
        return new Binding<T>(this._keys, this._factory, (factory: Func<T>, registeredContainer: Container, registeredScope: Scope, currentContainer: Container, currentScope: Scope) =>
            registeredScope.get(this, registeredContainer.resolveFunction(factory)));
    }

    perContainer(): Binding<T> {
        return new Binding<T>(this._keys, this._factory, (factory: Func<T>, registeredContainer: Container, registeredScope: Scope, currentContainer: Container, currentScope: Scope) =>
            currentScope.get(this, currentContainer.resolveFunction(factory)));
    }

    perDependency() {
        return new Binding<T>(this._keys, this._factory, (factory: Func<T>, registeredContainer: Container, registeredScope: Scope, currentContainer: Container, currentScope: Scope) =>
            currentScope.get(null, currentContainer.resolveFunction(factory)));
    }

    bindLifetime(boundContainer: Container, boundScope: Scope) {
        let innerLifetime = this._lifeTime;
        return new Binding<T>(this._keys, this._factory, (factory: Func<T>, registeredResolve: Container, registeredScope: Scope, resolve: Container, currentScope: Scope) =>
            innerLifetime(factory, boundContainer, boundScope, resolve, currentScope));
    }

    then(callback: (value: T) => void) {
        return this.withFactory(innerFactory => dependant(getDependencies(innerFactory), (...args: any[]) => {
            let value = innerFactory(...args);
            callback(value);
            return value;
        }));
    }

    useParameterHook(hook: (container: Container, dep: Dependency) => any) {
        verifyIsFunction(hook, "Parameter hook");

        return this.withFactory(innerFactory => dependant([Container, Locals], (c: Container, local: Locals) => {
            let originalDependencies = getDependencies(innerFactory);
            let hookedDependencies = originalDependencies.map(dep => {
                let hookValue = hook(c, dep);
                return isDefined(hookValue)
                    ? bind().toValue(hookValue)
                    : dep;
            });

            return c.resolveFunction(dependant(hookedDependencies, (...args: any[]) => innerFactory(...args)), local.keys, local.values)();
        }));
    }

    withDependency<T>(key: Constructor<T>, value: T): this
    withDependency(key: string | symbol, value: any): this
    withDependency(key: Dependency, value: any) {
        return this.useParameterHook((container: Container, paramKey: Dependency) => {
            if (paramKey === key) return value;
        });
    }

    withArguments(...args: any[]) {
        return this.withFactory(innerFactory => dependant(getDependencies(innerFactory).slice(args.length), (...rest: any[]) => innerFactory(...args, ...rest)));
    }

    build(container: Container, scope: Scope) {
        return this._lifeTime(this._factory, container, scope, container, scope);
    }
}

function verifyIsFunction(fn: Function, name: string) {
    if (!isFunction(fn))
        throw new Error(name + " is not a function");
}

function isBindableKey(key: BindableKey): key is BindableKey {
    return isFunction(key)
        || typeof key == 'string'
        || typeof key == 'symbol';
}

function constructor<T>(fn: Constructor<T>): Func<T> {
    return dependant(getDependencies(fn), (...args: any[]) => Reflect.construct(fn, args));
}

export function bind<T>(type: Constructor<T>): Binding<T>
export function bind<T1, T2>(type1: Constructor<T1>, type2: Constructor<T2>): Binding<T1 & T2>
export function bind<T1, T2, T3>(type1: Constructor<T1>, type2: Constructor<T2>, type3: Constructor<T3>): Binding<T1 & T2 & T3>
export function bind<T1, T2, T3, T4>(type1: Constructor<T1>, type2: Constructor<T2>, type3: Constructor<T3>, type4: Constructor<T4>): Binding<T1 & T2 & T3 & T4>
export function bind<T>(...names: (string | symbol)[]): Binding<T>
export function bind(...keys: BindableKey[]) {
    return Binding.from(keys);
}

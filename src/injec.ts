/// <reference path="extensions.d.ts" />
/// <reference path="Reflect.d.ts" />
let maxDependencyDepth = 20;
let scopeFn = Symbol('inject.scope'); // Key for current scope
let locals = Symbol('inject.locals');
let resolveChain = <Dependency[]>[];
const dependencyOverrideKey = 'design:dependencyOverrides';

export type BindableKey = string | symbol | Constructor<any>;
export type Dependency = BindableKey | Binding<any>;
type Constructor<T> = Function & ({ new (...args: any[]): T } | { prototype: T });
type Locals = { keys: Dependency[], values: any[] };
type Func<T> = (...args: any[]) => T;

export function bind<T>(type: Constructor<T>): Binding<T>
export function bind<T1, T2>(type1: Constructor<T1>, type2: Constructor<T2>): Binding<T1 & T2>
export function bind<T1, T2, T3>(type1: Constructor<T1>, type2: Constructor<T2>, type3: Constructor<T3>): Binding<T1 & T2 & T3>
export function bind<T1, T2, T3, T4>(type1: Constructor<T1>, type2: Constructor<T2>, type3: Constructor<T3>, type4: Constructor<T4>): Binding<T1 & T2 & T3 & T4>
export function bind<T>(...names: (string | symbol)[]): Binding<T>
export function bind(...keys: BindableKey[]) {
    return Binding.from(keys);
}

interface IFunctionBinding<TFunc extends TResult, TResult> extends Binding<TFunc> {
    toFunction(fn: Func<TResult>): this;
}

export const Injectable: ClassDecorator = (target: Function) => target;

export interface ConstructorParameterDecorator {
    (target: Function, propertyKey: undefined, parameterIndex: number): void;
}

export function Named(name: string | symbol): ConstructorParameterDecorator {
    return (target: Function, propertyKey: undefined, parameterIndex: number) => {
        if (propertyKey)
            throw new Error("@Named is only allowed on constructor parameters");
        dependencyOverrides(target)[parameterIndex] = name;
    };
}

export function Optional<T>(ctor: Constructor<T>, defaultValue?: T): ConstructorParameterDecorator
export function Optional<T>(binding: Binding<T>, defaultValue?: T): ConstructorParameterDecorator
export function Optional<T>(key: string | symbol, defaultValue?: T): ConstructorParameterDecorator
export function Optional<T>(key: Dependency, defaultValue?: T): ConstructorParameterDecorator {
    return (target: Function, propertyKey: undefined, parameterIndex: number) => {
        if (propertyKey)
            throw new Error("@Optional is only allowed on constructor parameters");
        dependencyOverrides(target)[parameterIndex] = optional(key, defaultValue);
    };
}

export function All<T>(key: Dependency): ConstructorParameterDecorator {
    return (target: Function, propertyKey: undefined, parameterIndex: number) => {
        if (propertyKey)
            throw new Error("@All is only allowed on constructor parameters");
        dependencyOverrides(target)[parameterIndex] = all(key);
    };
}


export function Factory<T>(type: Constructor<T>, funcDependencies?: Dependency[]): ConstructorParameterDecorator;
export function Factory<T>(key: Dependency, funcDependencies?: Dependency[]): ConstructorParameterDecorator;
export function Factory<T>(key: Dependency, funcDependencies: Dependency[] = []): ConstructorParameterDecorator {
    return (target: Function, propertyKey: undefined, parameterIndex: number) => {
        if (propertyKey)
            throw new Error("@Factory is only allowed on constructor parameters");
        dependencyOverrides(target)[parameterIndex] = makeFactory(key, funcDependencies);
    };
}

function dependencyOverrides(ctor: Function): Dependency[] {
    let overrides: Dependency[] = Reflect.getMetadata(dependencyOverrideKey, ctor);
    if (!overrides)
        Reflect.defineMetadata(dependencyOverrideKey, overrides = [], ctor);
    return overrides;;
}

export function fallback(fallbackFn: (key: Dependency) => any, parentContainer?: IParentContainer) {
    return new FallbackContainer(fallbackFn, parentContainer);
}

class FallbackContainer implements IParentContainer {
    private parentContainer: IParentContainer;
    registeredBindings: IParentLookup<Dependency, Binding<any>>;

    constructor(fallbackFn: (key: Dependency) => any, parentContainer?: IParentContainer) {
        this.parentContainer = parentContainer || { registeredBindings: new Lookup<Dependency, Binding<any>>(), resolve() { } };
        this.registeredBindings = new FallbackContainerLookup(fallbackFn, this.parentContainer.registeredBindings);
    }

    resolve(key: Dependency) {
        return this.parentContainer.resolve(key);
    }
}

class FallbackContainerLookup implements IParentLookup<Dependency, Binding<any>> {
    constructor(private fallbackFn: (key: Dependency) => any, private parentLookup: IParentLookup<Dependency, Binding<any>>) { }

    get(key: Dependency): Binding<any> | undefined {
        let value = this.fallbackFn(key);
        return isDefined(value)
            ? bind().toValue(value)
            : this.parentLookup.get(key);
    }

    getAll(key: Dependency): Binding<any>[] {
        let value = this.fallbackFn(key);
        return this.parentLookup.getAll(key)
            .concat(isDefined(value) ? [bind().toValue(value)] : []);
    }
}

interface IParentContainer {
    registeredBindings: IParentLookup<Dependency, Binding<any>>;
    resolve(key: Dependency): any;
}

export class Container implements IParentContainer, IDisposable {
    registeredBindings: Lookup<Dependency, Binding<any>>;
    private scope = new Scope();

    constructor(bindings: Binding<any>[] = [], parentContainer?: IParentContainer) {
        let bindingsPlusBuiltins = bindings
            .concat(bind(Container).toValue(this), bind(scopeFn).toValue(this.scope))
            .map(b => b.bindLifetime(this, this.scope));
        let keyBindingPairs = flatMap(bindingsPlusBuiltins, b => b.keys.map(k => [k, b] as [Dependency, Binding<any>]));
        this.registeredBindings = new Lookup(keyBindingPairs, parentContainer && parentContainer.registeredBindings);

        if (parentContainer)
            parentContainer.resolve(bind().toValue(this).once());
    }

    resolve<T>(ctor: Constructor<T>): T
    resolve<T>(binding: Binding<T>): T
    resolve<T>(key: string | symbol): T
    resolve(key: Dependency): any
    resolve(key: Dependency): any {
        if (!key)
            throw new Error("Tried to resolve " + name(key));

        if (resolveChain.length == maxDependencyDepth)
            throw new Error("Maximum dependency depth of " + maxDependencyDepth + " reached" + resolveChainMessage());

        resolveChain.push(key);
        try {
            let result = this.defaultBinding(key).build(this, this.scope);
            if (notDefined(result))
                throw new Error(name(key) + " resolved to undefined" + resolveChainMessage());
            return result;
        } finally {
            resolveChain.pop();
        }
    }

    resolveFunction<T>(fn: Func<T>, localKeys: Dependency[] = [], localValues: any[] = []) {
        let self = this;
        return function (...args: any[]): T {
            return fn.apply(this, self.resolveDependencies(dependencies(fn), localKeys || [], localValues || []).concat(args));
        }
    }

    defaultBinding(key: Dependency): Binding<any> {
        if (isBinding(key))
            return key;

        let binding = this.registeredBindings.get(key);
        if (binding)
            return binding;

        if (isFunction(key))
            return this.registeredBindings.add(key, bind(key).toType(key).perContainer());

        throw new Error('Failed to resolve key ' + name(key) + resolveChainMessage());
    }

    resolveDependencies(required: Dependency[], localKeys: Dependency[], localValues: any[]) {
        let localLookup = newLocalLookup(localKeys, localValues);
        return required.map(dep => localLookup(dep, () => this.resolve(dep)));
    }

    dispose() {
        this.scope.dispose();
    }
}

export class Binding<T> implements Binding<T> {
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
        return this.withFactory(() => dependant([Container, locals], (c: Container, local: Locals) => c.resolveFunction(fn, local.keys, local.values) as any as T));
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
        return this.withFactory(innerFactory => dependant(dependencies(innerFactory), (...args: any[]) => {
            let value = innerFactory(...args);
            callback(value);
            return value;
        }));
    }

    useParameterHook(hook: (container: Container, dep: Dependency) => any) {
        verifyIsFunction(hook, "Parameter hook");

        return this.withFactory(innerFactory => dependant([Container, locals], (c: Container, local: Locals) => {
            let originalDependencies = dependencies(innerFactory);
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
        return this.withFactory(innerFactory => dependant(dependencies(innerFactory).slice(args.length), (...rest: any[]) => innerFactory(...args, ...rest)));
    }

    build(container: Container, scope: Scope) {
        return this._lifeTime(this._factory, container, scope, container, scope);
    }
}

function resolveChainMessage() {
    return resolveChain.length > 1
        ? " while attempting to resolve "
        + resolveChain
            .slice(0, -1)
            .map(name)
            .join(' -> ')
        : '';
}

function dependencies(ctor: any): Dependency[] { // TODO typing
    return ctor.dependencies || [];
}

function name(key: Dependency) {
    return isFunction(key)
        ? key.name || "Type"
        : "'" + String(key) + "'";
}

class Scope {
    private lookup = new Lookup<Binding<any> | null, any>();

    get<T>(key: Binding<T> | null, resolveForKey: () => any) {
        let value = key ? this.lookup.get(key) : undefined;
        if (value != undefined)
            return value;
        value = resolveForKey();
        return key || isDisposable(value)
            ? this.lookup.add(key, this.disposable(key, value))
            : value
    }

    private disposable<T>(key: Binding<T> | null, value: any) {
        if (isDisposable(value)) {
            let innerDispose = value.dispose;
            value.dispose = () => {
                this.lookup.remove(key, value);
                innerDispose.call(value);
            };
        }
        return value;
    }

    dispose() {
        this.lookup.values()
            .filter(isDisposable)
            .forEach(value => value.dispose());
    }
}

function isDisposable(value: any): value is IDisposable {
    return value
        && isFunction(value.dispose);
}

interface IDisposable {
    dispose(): void;
}

function newLocalLookup(keys: Dependency[], values: any[]) {
    return function localLookup(key: Dependency, fallback: (key: Dependency) => any) {
        let i = keys.indexOf(key);
        keys = keys.slice();    // Don't want to modify someone else's arrays
        values = values.slice();
        return key == locals ? { keys: keys, values: values }
            : i < 0 ? fallback(key)
                : (keys.splice(i, 1), values.splice(i, 1)[0]);
    };
}

interface IParentLookup<TKey, TValue> {
    get(key: TKey): TValue | undefined;
    getAll(key: TKey): TValue[];
}

class Lookup<TKey, TValue> implements IParentLookup<TKey, TValue> {
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

export function makeFactory<T>(type: Constructor<T>, funcDependencies?: Dependency[]): Binding<Func<T>>;
export function makeFactory<T>(key: Dependency, funcDependencies?: Dependency[]): Binding<Func<T>>;
export function makeFactory<T>(key: Dependency, funcDependencies: Dependency[] = []): Binding<Func<T>> {
    return bind<Func<T>>().to(c => (...args: any[]) => {
        let defaultBinding = c.defaultBinding(key);
        let bindingWithSuppliedLocals = defaultBinding
            .withFactory(innerFactory => () => c.resolveFunction(innerFactory, funcDependencies, args)())
            .perDependency();
        return c.resolve(bindingWithSuppliedLocals);
    });
}

export function optional<T>(key: Dependency, defaultValue?: T) {
    return bind().to(c => c.registeredBindings.get(key) ? c.resolve(key) : defaultArg(defaultValue, null));
}

export function all<T>(key: Dependency): Binding<T[]> {
    return bind<T[]>().to(c => c.registeredBindings.getAll(key).map(b => c.resolve(b)));
}

function defaultArg<T>(arg: T | undefined, defaultValue: T) {
    return notDefined(arg)
        ? defaultValue
        : arg;
}

function constructor<T>(fn: Constructor<T>): Func<T> {
    return dependant(dependencies(fn), (...args: any[]) => Reflect.construct(fn, args));
}

export function dependant<T extends Function>(dependencies: Dependency[], fn: T) {
    if (dependencies.some(notDefined))
        throw new Error(name(fn) + " has an undefined dependency");

    return Object.assign(fn, { dependencies: dependencies });
}

function flatMap<TIn, TOut>(array: TIn[], mapFn: (item: TIn) => TOut[]): TOut[] {
    return Array.prototype.concat.apply([], array.map(mapFn));
}

function last<T>(array: T[]): T {
    return array[array.length - 1];
}

function isBindableKey(key: BindableKey): key is BindableKey {
    return isFunction(key)
        || typeof key == 'string'
        || typeof key == 'symbol';
}

function isBinding(dep: Dependency): dep is Binding<any> {
    return !!(dep as Binding<any>).build;
}

function verifyIsFunction(fn: Function, name: string) {
    if (!isFunction(fn))
        throw new Error(name + " is not a function");
}

function isFunction(fn: any): fn is Function {
    return typeof fn == 'function';
}

function notDefined(value: any): value is undefined {
    return !isDefined(value);
}

function isDefined(value: any) {
    return typeof value != 'undefined';
}

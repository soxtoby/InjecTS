import { Constructor, Func, isDefined } from './types';
import { getDependencies, Dependency } from './dependencies';
import { Binding, bind } from './binding';

export const Injectable: ClassDecorator = (ctor: Function) => {
    let ctorParamTypes: Constructor<any>[] = Reflect.getMetadata('design:paramtypes', ctor) || [];
    ctorParamTypes.forEach((type, parameterIndex) => {
        let deps = getDependencies(ctor);
        if (type != Object && !deps[parameterIndex])
            deps[parameterIndex] = type;
    });
    return ctor;
};

interface ConstructorParameterDecorator {
    (target: Function, propertyKey: undefined, parameterIndex: number): void;
}

export function Named(name: string | symbol): ConstructorParameterDecorator {
    return (target: Function, propertyKey: undefined, parameterIndex: number) => {
        if (propertyKey)
            throw new Error("@Named is only allowed on constructor parameters");
        getDependencies(target)[parameterIndex] = name;
    };
}

export function Optional<T>(ctor: Constructor<T>, defaultValue?: T): ConstructorParameterDecorator
export function Optional<T>(binding: Binding<T>, defaultValue?: T): ConstructorParameterDecorator
export function Optional<T>(key: string | symbol, defaultValue?: T): ConstructorParameterDecorator
export function Optional<T>(key: Dependency, defaultValue?: T): ConstructorParameterDecorator {
    return (target: Function, propertyKey: undefined, parameterIndex: number) => {
        if (propertyKey)
            throw new Error("@Optional is only allowed on constructor parameters");
        getDependencies(target)[parameterIndex] = optional(key, defaultValue);
    };
}

export function All<T>(key: Dependency): ConstructorParameterDecorator {
    return (target: Function, propertyKey: undefined, parameterIndex: number) => {
        if (propertyKey)
            throw new Error("@All is only allowed on constructor parameters");
        getDependencies(target)[parameterIndex] = all(key);
    };
}

export function Factory<T>(type: Constructor<T>, funcDependencies?: Dependency[]): ConstructorParameterDecorator;
export function Factory<T>(key: Dependency, funcDependencies?: Dependency[]): ConstructorParameterDecorator;
export function Factory<T>(key: Dependency, funcDependencies: Dependency[] = []): ConstructorParameterDecorator {
    return (target: Function, propertyKey: undefined, parameterIndex: number) => {
        if (propertyKey)
            throw new Error("@Factory is only allowed on constructor parameters");
        getDependencies(target)[parameterIndex] = factory(key, funcDependencies);
    };
}

export function factory<T>(type: Constructor<T>, funcDependencies?: Dependency[]): Binding<Func<T>>;
export function factory<T>(key: Dependency, funcDependencies?: Dependency[]): Binding<Func<T>>;
export function factory<T>(key: Dependency, funcDependencies: Dependency[] = []): Binding<Func<T>> {
    return bind<Func<T>>().to(c => (...args: any[]) => {
        let defaultBinding = c.defaultBinding(key);
        let bindingWithSuppliedLocals = defaultBinding
            .withFactory(innerFactory => () => c.resolveFunction(innerFactory, funcDependencies, args)())
            .perDependency();
        return c.resolve(bindingWithSuppliedLocals);
    });
}

export function optional<T>(key: Dependency, defaultValue?: T) {
    return bind().to(c => c.registeredBindings.get(key) ? c.resolve(key) 
        : isDefined(defaultValue) ? defaultValue
        : null);
}

export function all<T>(key: Dependency): Binding<T[]> {
    return bind<T[]>().to(c => c.registeredBindings.getAll(key).map(b => c.resolve(b)));
}

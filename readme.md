InjectTS
========
A dependency injection library for TypeScript.

Features
--------
* Rich, type-safe configuration
* Infer dependencies from parameter types
* Use types, strings or symbols to identify dependencies
* Inject factory functions and optional dependencies
* Easily control the lifetime of dependencies

Getting Started
---------------
1. Install with NPM
```
npm install injec-ts
```

2. Import and construct a container
```ts
import { Container } from 'injec-ts/injec';
let container = new Container();
```

3. Resolve your class
```ts
let myClass = container.resolve(MyClass);
```

Configuration
-------------
Pass binding configuration into the Container constructor:
```ts
import { Container, bind } from 'injec-ts/injec';
let container = new Container([
    bind(Type).toType(SubType),
    bind('string').ToType(Type),
    bind(Symbol('my symbol')).toType(Type),
    bind('something').toValue('some value'),
    bind(AnotherType).to(c => new AnotherType(c.resolve(Dependency)))
]);
```

Specify dependencies with decorators:
```ts
import { Injectable, Named, Optional, Factory, All } from 'injec-ts/injec';

@Injectable // Allows inferring dependencies from parameters
class MyClass {
    constructor(
        typedDependency: MyService, // Dependency inferred from parameter type
        @Named('some name') namedDependency: INamedService, // Dependency specified with string or Symbol
        @Optional(OptionalService) optionalDependency?: OptionalService, // Dependency only injected if service is explicitly bound in container
        @Factory(Type, [ParamType]) typeFactory: (param: ParamType) => Type, // Factory method resolves type when called
        @All(BaseService) registeredServices: BaseService[] // Resolves all bindings of specified dependency
    ) { }
}
```

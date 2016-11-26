import * as chai from "chai";
import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";
import "./sinon-basil";
import "./lib/basil/basil-browser-runner";
import "reflect-metadata";
import * as inject from "../src/injec";

let expect = chai.expect;
chai.should();
chai.use(sinonChai);

describe("inject.js", function () {
    class type { }
    class dependency1 { }
    class dependency2 { }
    @inject.Injectable
    class typeWithDependencies {
        constructor(public dependency1: dependency1, public dependency2: dependency2) { }
    }
    class disposableType extends type {
        dispose = sinon.spy();
        disposeMethod = this.dispose;
    }
    class subType extends type { }

    describe("empty container", () => {
        let sut = new inject.Container();

        when("resolving existing class", () => {
            class unregisteredClass { }
            let result = sut.resolve(unregisteredClass);

            it("instantiates unregistered class", () => {
                result.should.be.an.instanceOf(unregisteredClass);
            });
        });

        when("resolving existing class with parameter but no specified dependencies", () => {
            class typeWithParameter { constructor(public arg: any) { } }
            let result = sut.resolve(typeWithParameter);

            it("resolves to instance of type with nothing passed in", () => {
                result.should.be.an.instanceOf(typeWithParameter);
                expect(result.arg).to.be.undefined;
            });
        });

        when("type has multiple dependencies", () => {
            when("resolving type", () => {
                let result = sut.resolve(typeWithDependencies);

                it("instantiates type with dependencies", () => {
                    result.dependency1.should.be.an.instanceOf(dependency1);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });

            when("resolving factory function with no parameters", () => {
                let factory = sut.resolve(inject.makeFactory(typeWithDependencies));

                then("calling factory instantiates type with dependencies", () => {
                    let result = factory();
                    result.dependency1.should.be.an.instanceOf(dependency1);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });

            assertFactoryFunctionDependencyResolution(sut);
        });

        when("resolving optional dependency", () => {
            when("with no default value", () => {
                let result = sut.resolve(inject.optional(type));

                it("resolves to null", () => {
                    expect(result).to.equal(null);
                });

                then("container can be disposed", () => {
                    sut.dispose();
                });
            });

            when("with a default value", () => {
                let expectedValue = {};
                let result = sut.resolve(inject.optional(type, expectedValue));

                it("resolves to default value", () => {
                    result.should.equal(expectedValue);
                });
            });
        });

        when("resolving a container", () => {
            let result = sut.resolve(inject.Container);

            then("same container instance is returned", () => {
                result.should.equal(sut);
            });
        });

        when("resolving an object with a non-function dispose property", () => {
            function undisposable() { }
            undisposable.prototype.dispose = 'foo';

            let result = sut.resolve(undisposable);

            then("dispose property untouched", () => {
                result.dispose.should.equal('foo');
            });
        });
    });

    describe("fallback resolve", () => {
        let fallbackFn = sinon.stub();
        let registeredKey = 'foo';
        let registeredValue = 'bar';
        let registration = inject.bind(registeredKey).toValue(registeredValue);

        when("injected without parent container", () => {
            let sut = new inject.Container([registration], inject.fallback(fallbackFn));

            when("resolving registered key", () => {
                let result = sut.resolve(registeredKey);

                then("registered value returned", () => {
                    result.should.equal(registeredValue);
                });
            });

            when("resolving unregistered key", () => {
                let unregisteredKey = 'bar';
                let fallbackValue = 'baz';
                fallbackFn.withArgs(unregisteredKey).returns(fallbackValue);
                let result = sut.resolve(unregisteredKey);

                then("resolved through fallback function", () => {
                    result.should.equal(fallbackValue);
                });
            });

            when("resolving injected binding without a fallback value", () => {
                let result = sut.registeredBindings.get('bar');

                then("binding is undefined", () => {
                    expect(result).to.be.undefined;
                });
            });
        });

        when("injected with parent container", () => {
            let outerKey = 'bar';
            let outerValue = 'baz';
            let outer = new inject.Container([inject.bind(outerKey).toValue(outerValue)]);
            let inner = new inject.Container([registration], inject.fallback(fallbackFn, outer));

            when("resolving key registered in inner container", () => {
                let result = inner.resolve(registeredKey);

                then("registered value returned", () => {
                    result.should.equal(registeredValue);
                });
            });

            when("fallback returns value for key registered in outer container", () => {
                let fallbackValue = 'qux';
                fallbackFn.withArgs(outerKey).returns(fallbackValue);

                when("resolving key registered in outer container", () => {
                    let result = inner.resolve(outerKey);

                    then("fallback value returned", () => {
                        result.should.equal(fallbackValue);
                    });
                });
            });

            when("fallback returns nothing for key registered in outer container", () => {
                when("resolving key registered in outer container", () => {
                    let result = inner.resolve(outerKey);

                    then("outer container's value returned", () => {
                        result.should.equal(outerValue);
                    });
                });
            });
        });
    });

    describe("type registration", () => {
        when("setting up a registration for a type", () => {
            let binding = inject.bind(type);

            when("subtype created for type", () => {
                let subTypeBinding = binding.toType(subType);
                let sut = new inject.Container([subTypeBinding]);

                isABinding(subTypeBinding);

                when("resolving type", () => {
                    let result = sut.resolve(type);

                    it("instantiates the sub type", () => {
                        result.should.be.an.instanceOf(subType);
                    });
                });
            });

            when("value used for type", () => {
                let value = new disposableType();
                let valueBinding = binding.toValue(value);
                let sut = new inject.Container([valueBinding]);

                isABinding(valueBinding);

                when("type is resolved", () => {
                    let result = sut.resolve(type);

                    it("resolves to the object", () => {
                        result.should.equal(value);
                    });

                    when("container is disposed", () => {
                        sut.dispose();

                        then("value is not disposed", () => {
                            value.disposeMethod.should.not.have.been.called;
                        });
                    });
                });
            });

            when("bound to simple factory", () => {
                let expectedResult = new type();
                let simpleFactory = sinon.stub();
                let factoryBinding = binding.to(simpleFactory);
                let sut = new inject.Container([factoryBinding]);
                simpleFactory.withArgs(sut).returns(expectedResult);

                isABinding(factoryBinding);

                when("type is resolved", () => {
                    let result = sut.resolve(type);

                    it("resolves to factory return value", () => {
                        result.should.equal(expectedResult);
                    });
                });
            });

            when("factory method called for type", () => {
                let expectedResult = new type();
                let factory = inject.dependant([dependency1], sinon.stub().returns(expectedResult));
                let factoryBinding = binding.withFactory(() => factory);
                let sut = new inject.Container([factoryBinding]);

                isABinding(factoryBinding);

                when("type is resolved", () => {
                    let result = sut.resolve(type);

                    then("dependencies are passed in to factory", () => {
                        factory.firstCall.args[0].should.be.an.instanceOf(dependency1);
                    });

                    then("resolves to factory return value", () => {
                        result.should.equal(expectedResult);
                    });
                });
            });
        });

        when("setting up a registration for a key", () => {
            let key = 'named';
            let binding = inject.bind(key);

            when("type created for key", () => {
                let typeBinding = binding.toType(type);

                when("resolving key", () => {
                    let result = new inject.Container([typeBinding]).resolve(key);

                    it("resolves to instance of the registered type", () => {
                        result.should.be.an.instanceOf(type);
                    });
                });

                // when("resolving named dependency", () => {
                //     let result = new inject.Container([registration]).resolve(inject.named(type, key));

                //     it("resolves to instance of the registered type", () => {
                //         result.should.be.an.instanceOf(type);
                //     });
                // });

                when("another type is registered with a different name", () => {
                    function type2() { }
                    let binding2 = inject.bind('different').toType(type2);
                    let sut = new inject.Container([typeBinding, binding2]);

                    when("resolving first name", () => {
                        let result = sut.resolve(key);

                        it("resolves to instance of the first type", () => {
                            result.should.be.an.instanceOf(type);
                        });
                    });

                    when("resolving the second name", () => {
                        let result = sut.resolve('different');

                        it("resolves to instance of the second type", () => {
                            result.should.be.an.instanceOf(type2);
                        });
                    });
                });
            });

            when("function resolved for key", () => {
                let expectedResult = 'baz';
                let func = inject.dependant([dependency1, dependency2], sinon.stub());
                func.returns(expectedResult);
                let functionBinding = binding.toFunction(func);

                isABinding(functionBinding);

                when("resolving key", () => {
                    let result = new inject.Container([functionBinding]).resolve(key) as sinon.SinonStub;

                    then("result is a function", () => {
                        result.should.be.a('function');
                    });

                    when("result is called", () => {
                        let resultResult = result('foo', 'bar');

                        then("function is called with dependencies and passed in arguments", () => {
                            let args = func.firstCall.args;
                            args[0].should.be.an.instanceOf(dependency1);
                            args[1].should.be.an.instanceOf(dependency2);
                            args[2].should.equal('foo');
                            args[3].should.equal('bar');
                        });

                        it("returns function return value", () => {
                            resultResult.should.equal(expectedResult);
                        });
                    });
                });

                when("resolving factory function with partial parameters", () => {
                    let sut = new inject.Container([functionBinding]);
                    let factory = sut.resolve(inject.makeFactory(key, [dependency2]));

                    when("calling factory function", () => {
                        let dependency2Instance = new dependency2();
                        let result = factory(dependency2Instance) as sinon.SinonStub;

                        then("result is a function", () => {
                            result.should.be.a('function');
                        });

                        when("result is called", () => {
                            let resultResult = result('foo', 'bar');

                            then("function is called with specified dependency, resolved dependencies, and passed in arguments", () => {
                                let args = func.firstCall.args;
                                args[0].should.be.an.instanceOf(dependency1);
                                args[1].should.equal(dependency2Instance);
                                args[2].should.equal('foo');
                                args[3].should.equal('bar');
                            });

                            it("returns function return value", () => {
                                resultResult.should.equal(expectedResult);
                            });
                        });
                    });
                });
            });

            when("factory called for key, returning a string", () => {
                let expectedResult = 'baz';
                let factoryBinding = binding.to(() => expectedResult);

                when("resolving key", () => {
                    let sut = new inject.Container([factoryBinding]);
                    let result = sut.resolve(key);

                    then("result is the factory return value", () => {
                        result.should.equal(expectedResult);
                    });

                    then("container can be disposed", () => {
                        sut.dispose();
                    });
                });
            });
        });

        when("registering multiple things for the same key", () => {
            let sut = new inject.Container([
                inject.bind('key').toValue('one'),
                inject.bind('key').toValue('two')
            ]);

            when("resolving key", () => {
                let result = sut.resolve('key');

                then("last registration is resolved", () => {
                    result.should.equal('two');
                });
            });

            when("resolving everything for key", () => {
                let result = sut.resolve(inject.all('key'));

                then("all registrations are resolved", () => {
                    result.should.deep.equal(['one', 'two']);
                });
            });
        });

        when("registering multiple subtypes for the same base type", () => {
            let subType2 = function () { };
            subType2.prototype = new type();
            let sut = new inject.Container([
                inject.bind(type).toType(subType),
                inject.bind(type).toType(subType2).perDependency()
            ]);

            when("resolving type", () => {
                let result = sut.resolve(type);

                then("last registration is resolved", () => {
                    result.should.be.an.instanceOf(subType2);
                });
            });

            when("resolving everything for type", () => {
                let result = sut.resolve(inject.all(type));

                then("all registrations are resolved", () => {
                    result.should.have.length(2);
                    result[0].should.be.an.instanceOf(subType);
                    result[1].should.be.an.instanceOf(subType2);
                });
            });

            when("resolving everything for type twice", () => {
                let result1 = sut.resolve(inject.all(type));
                let result2 = sut.resolve(inject.all(type));

                then("lifetimes are observed", () => {
                    result1[0].should.equal(result2[0]); // per-container
                    result1[1].should.not.equal(result2[1]); // per-dependency
                });
            });
        });

        when("registering a constructor", () => {
            let registration = inject.bind(type);
            let sut = new inject.Container([registration]);

            isABinding(registration);

            when("type is resolved", () => {
                let result = sut.resolve(type);

                then("type is constructed", () => {
                    result.should.be.an.instanceOf(type);
                });
            });
        });

        when("registering a constructor for a base type", () => {
            let registration = inject.bind(type).toType(subType);
            let sut = new inject.Container([registration]);

            when("base type is resolved", () => {
                let result = sut.resolve(type);

                then("base type resolves to instance of subtype", () => {
                    result.should.be.an.instanceOf(subType);
                });
            });

            when("base type and subtype are resolved", () => {
                let baseResult = sut.resolve(type);
                let subResult = sut.resolve(subType);

                then("types resolve to separate instances", () => {
                    baseResult.should.not.equal(subResult);
                });
            });

            when("resolving type optionally", () => {
                let result = sut.resolve(inject.optional(type));

                it("instantiates the constructor", () => {
                    result.should.be.an.instanceOf(subType);
                });

                it("observes the lifetime of the registered type", () => {
                    result.should.equal(sut.resolve(type));
                });
            });
        });
        
        when("binding multiple types to the same type", () => {
            let registration = inject.bind(type, subType).toType(subType);
            let sut = new inject.Container([registration]);

            isABinding(registration);

            when("both types are resolved", () => {
                let result1 = sut.resolve(type);
                let result2 = sut.resolve(subType);

                then("types are resolved to same instance of constructor", () => {
                    result1.should.equal(result2);
                    result1.should.be.an.instanceOf(subType);
                });
            });
        });

        when("binding multiple keys to the same type", () => {
            let key1 = 'foo', key2 = 'bar';
            let registration = inject.bind(key1, key2).toType(type);
            let sut = new inject.Container([registration]);

            isABinding(registration);

            when("both keys are resolved", () => {
                let result1 = sut.resolve(key1);
                let result2 = sut.resolve(key2);

                then("keys are resolved to same instance of constructor", () => {
                    result1.should.equal(result2);
                    result1.should.be.an.instanceOf(type);
                });
            });
        });

        when("registering constructor as a singleton", () => {
            let registration = inject.bind(type).once();
            let sut = new inject.Container([registration]);

            isABinding(registration);

            when("resolving type twice", () => {
                let result1 = sut.resolve(type);
                let result2 = sut.resolve(type);

                then("type resolves to the same instance", () => {
                    result1.should.equal(result2);
                });
            });
        });

        when("registering a constructor with dependencies", () => {
            let sut = new inject.Container([inject.bind(typeWithDependencies)]);

            assertFactoryFunctionDependencyResolution(sut);
        });

        when("registering a factory method for a type", () => { // FIXME: duplicated
            let factory = sinon.stub();
            let registration = inject.bind(type).withFactory(() => factory);
            let sut = new inject.Container([registration]);

            isABinding(registration);

            when("factory returns instance of type & type is resolved", () => {
                let expectedResult = new type();
                factory.returns(expectedResult);
                inject.dependant([dependency1], factory);
                let result = sut.resolve(type);

                then("type resolves to factory return value", () => {
                    result.should.equal(expectedResult);
                });

                then("factory dependencies are passed in", () => {
                    factory.firstCall.args[0].should.be.an.instanceOf(dependency1);
                });
            });

            when("factory returns null & type is resolved", () => {
                factory.returns(null);
                let result = sut.resolve(type);

                then("type resolves to null", () => {
                    expect(result).to.be.null;
                });
            });
        });

        when("registering a value", () => {
            let value = {};
            let registration = inject.bind('key').toValue(value);
            let sut = new inject.Container([registration]);

            isABinding(registration);

            when("key is resolved", () => {
                let result = sut.resolve('key');

                then("key resolves to value", () => {
                    result.should.equal(value);
                });
            });
        });

        when("registering a null value for a type", () => { // FIXME: Is this right?
            let registration = inject.bind<type | null>(type).toValue(null);

            when("type is resolved", () => {
                let result = new inject.Container([registration]).resolve(type);

                it("resolves type to null", () => {
                    expect(result).to.be.null;
                });
            });
        });

        when("registering a post-build function", () => {
            let callback = sinon.spy(function (o: any) {
                o.callbackProperty = true;
            });
            let binding = inject.bind(type).then(callback);
            let sut = new inject.Container([binding]);

            when("type is resolved", () => {
                let result = sut.resolve(type);

                then("callback is called with resolved value", () => {
                    callback.should.have.been.calledWith(result);
                });
            });
        });

        when("registering a function", () => {
            let expectedResult = 'baz';
            let func = inject.dependant([dependency1, dependency2], sinon.stub());
            func.returns(expectedResult);
            let registration = inject.bind('key').toFunction(func);
            let sut = new inject.Container([registration, inject.bind(dependency2).perDependency()]);

            isABinding(registration);

            when("key is resolved", () => {
                let result = sut.resolve('key') as sinon.SinonStub;

                when("result is called", () => {
                    let resultResult = result('foo', 'bar');

                    then("function is called with dependencies and passed in arguments", () => {
                        let args = func.firstCall.args;
                        args[0].should.be.an.instanceOf(dependency1);
                        args[1].should.be.an.instanceOf(dependency2);
                        args[2].should.equal('foo');
                        args[3].should.equal('bar');
                    });

                    it("returns function return value", () => {
                        resultResult.should.equal(expectedResult);
                    });
                });

                when("result is called twice", function () {
                    result();
                    result();

                    then("dependency lifetimes respected", function () {
                        let firstCall = func.getCall(0);
                        let secondCall = func.getCall(1);

                        firstCall.args[0].should.equal(secondCall.args[0], "dependency1 is per-container");
                        firstCall.args[1].should.not.equal(secondCall.args[1], "dependency2 is per-dependency");
                    });
                });
            });
        });
    });

    describe("parameter registration", () => {
        let typeBinding = inject.bind(typeWithDependencies);

        when("type is registered with parameter hook", () => {
            let dependency1Instance = new dependency1();
            let parameterResolver = sinon.spy(function (c: inject.Container, d: inject.Dependency) {
                if (d == dependency1) return dependency1Instance;
            });
            let hookedBinding = typeBinding.useParameterHook(parameterResolver);
            let sut = new inject.Container([hookedBinding]);

            when("type is resolved", () => {
                let result = sut.resolve(typeWithDependencies);

                then("parameter resolver called with container & parameter", () => {
                    parameterResolver.should.have.been.calledWith(sut, dependency1);
                    parameterResolver.should.have.been.calledWith(sut, dependency2);
                });

                then("parameter is resolved to parameter factory result", () => {
                    result.dependency1.should.equal(dependency1Instance);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });

            assertFactoryFunctionDependencyResolution(sut);
        });

        when("registering a typed parameter", () => {
            let dependency2Instance = new dependency2();
            let configuredBinding = typeBinding.withDependency(dependency2, dependency2Instance);

            isABinding(configuredBinding);

            when("type is resolved", () => {
                let sut = new inject.Container([configuredBinding]);
                let result = sut.resolve(typeWithDependencies);

                then("type is resolved with specified value", () => {
                    result.dependency2.should.equal(dependency2Instance);
                });
            });
        });

        when("registering arguments", () => {
            let dependency1Instance = new dependency1();
            let dependency2Instance = new dependency2();
            let configuredBinding = typeBinding.withArguments(dependency1Instance, dependency2Instance);

            isABinding(configuredBinding);

            when("type is resolved", () => {
                let sut = new inject.Container([configuredBinding]);
                let result = sut.resolve(typeWithDependencies);

                then("type is resolved with specified values", () => {
                    result.dependency1.should.equal(dependency1Instance);
                    result.dependency2.should.equal(dependency2Instance);
                });
            });
        });
    });

    describe("sub-containers", () => {
        when("type is registered in original container", () => {
            let outer = new inject.Container([inject.bind('foo').toType(type)]);
            let inner = new inject.Container([], outer);

            then("type can be resolved from inner container", () => {
                inner.resolve('foo').should.be.an.instanceOf(type);
            });

            when("resolving everything for key from inner container", () => {
                let result = inner.resolve(inject.all('foo'));

                then("type is resolved", () => {
                    result.length.should.equal(1);
                    result[0].should.be.an.instanceOf(type);
                });
            });
        });

        when("type is registered in sub-container", () => {
            let outer = new inject.Container();
            let inner = new inject.Container([inject.bind('foo').toType(type)], outer);

            then("type can't be resolved from outer container", () => {
                (() => { outer.resolve('foo'); })
                    .should.throw();
            });

            then("type can be resolved from inner container", () => {
                inner.resolve('foo').should.be.an.instanceOf(type);
            });
        });

        when("registered in both outer and inner containers", () => {
            let outerValue = 'outer';
            let innerValue = 'inner';
            let outer = new inject.Container([inject.bind('foo').toValue(outerValue)]);
            let inner = new inject.Container([inject.bind('foo').toValue(innerValue)], outer);

            when("resolved from inner container", () => {
                let result = inner.resolve('foo');

                then("resolved to inner container value", () => {
                    result.should.equal(innerValue);
                });
            });

            when("resolving everything for key from inner container", () => {
                let result = inner.resolve(inject.all('foo'));

                then("resolved to values from both containers", () => {
                    result.should.have.members([outerValue, innerValue]);
                });
            });
        });

        when("outer container is disposed", () => {
            let outer = new inject.Container();
            let inner = new inject.Container([], outer);
            this.spy(inner, 'dispose');

            outer.dispose();

            then("inner container is disposed", () => {
                inner.dispose.should.have.been.called;
            });
        });

        when("inner container is disposed", () => {
            let outer = new inject.Container();
            let inner = new inject.Container([], outer);
            inner.dispose();
            this.spy(inner, 'dispose');

            when("outer container is disposed", () => {
                outer.dispose();

                then("inner container is not disposed again", () => {
                    inner.dispose.should.not.have.been.called;
                });
            });
        });
    });

    describe("lifetimes", () => {
        when("not registered", () => {
            assertInstancePerContainerLifeTime(new inject.Container());
        });

        when("registered as singleton in outer container", () => {
            let binding = inject.bind(disposableType);
            let singletonBinding = binding.once();
            let outer = new inject.Container([singletonBinding]);

            isABinding(singletonBinding);

            when("resolved twice from same container", () => {
                let result1 = outer.resolve(disposableType);
                let result2 = outer.resolve(disposableType);

                then("same instance returned both times", () => {
                    result1.should.equal(result2);
                });
            });

            when("resolved from outer & inner containers", () => {
                let inner = new inject.Container([], outer);
                let innerResult = inner.resolve(disposableType);
                let outerResult = outer.resolve(disposableType);

                then("same instance returned both times", () => {
                    outerResult.should.equal(innerResult);
                });

                when("inner container is disposed", () => {
                    inner.dispose();

                    then("resolved object is not disposed", () => {
                        innerResult.disposeMethod.should.not.have.been.called;
                    });
                });

                when("outer container is disposed", () => {
                    outer.dispose();

                    then("resolved object is disposed", () => {
                        innerResult.disposeMethod.should.have.been.called;
                    });
                });
            });
        });

        when("registered as singleton in inner container", () => {
            let registration = inject.bind(disposableType).perDependency();
            let outer = new inject.Container([registration]);
            let inner = new inject.Container([inject.bind(disposableType).once()], outer);

            when("resolved from outer container twice", () => {
                let result1 = outer.resolve(disposableType);
                let result2 = outer.resolve(disposableType);

                then("different instances returned", () => {
                    return result1.should.not.equal(result2);
                });
            });

            when("when resolved from inner container twice", () => {
                let result1 = inner.resolve(disposableType);
                let result2 = inner.resolve(disposableType);

                then("same instance returned both times", () => {
                    return result1.should.equal(result2);
                });
            });

            when("resolved from outer & inner containers", () => {
                let outerResult = outer.resolve(disposableType);
                let innerResult = inner.resolve(disposableType);

                then("different instances returned", () => {
                    return innerResult.should.not.equal(outerResult);
                });
            });
        });

        when("type with dependencies registered as singleton", () => {
            let outerDependency1 = new dependency1();
            let outerDependency2 = new dependency2();
            let outer = new inject.Container([
                inject.bind(typeWithDependencies).once(),
                inject.bind(dependency1).toValue(outerDependency1),
                inject.bind(dependency2).toValue(outerDependency2)
            ]);

            when("resolved from an inner container", () => {
                let inner = new inject.Container([
                    inject.bind(dependency1).toValue(new dependency1()),
                    inject.bind(dependency2).toValue(new dependency2())
                ], outer);

                let result = inner.resolve(typeWithDependencies);

                then("dependencies are resolved from outer container", () => {
                    result.dependency1.should.equal(outerDependency1);
                    result.dependency2.should.equal(outerDependency2);
                });
            });

            assertFactoryFunctionLifeTime(outer);
        });

        when("registered with instance per container lifetime", () => {
            let registration = inject.bind(disposableType);
            let chain = registration.perContainer();
            let outer = new inject.Container([registration]);

            isABinding(chain);

            assertInstancePerContainerLifeTime(outer);
        });

        when("registered with instance per dependency lifetime", () => {
            let binding = inject.bind(disposableType);
            let perDependencyBinding = binding.perDependency();

            let sut = new inject.Container([perDependencyBinding]);

            isABinding(perDependencyBinding);

            when("type is resolved twice", () => {
                let result1 = sut.resolve(disposableType);
                let result2 = sut.resolve(disposableType);

                then("two separate instances are created", () => {
                    result1.should.not.equal(result2);
                });

                when("container is disposed", () => {
                    sut.dispose();

                    then("resolved objects are disposed as well", () => {
                        result1.disposeMethod.should.have.been.called;
                        result2.disposeMethod.should.have.been.called;
                    });
                });

                when("resolved object is disposed", () => {
                    result1.dispose();

                    when("container is disposed", () => {
                        sut.dispose();

                        then("disposed resolved object is not disposed again", () => {
                            result1.disposeMethod.should.have.been.calledOnce;
                        });
                    });
                });
            });
        });

        function assertInstancePerContainerLifeTime(outer: inject.Container) {
            when("resolved twice from same container", () => {
                let result1 = outer.resolve(disposableType);
                let result2 = outer.resolve(disposableType);

                then("same instance returned both times", () => {
                    result1.should.equal(result2);
                });
            });

            when("resolved from outer & inner containers", () => {
                let inner = new inject.Container([], outer);
                let result1 = outer.resolve(disposableType);
                let result2 = inner.resolve(disposableType);

                then("two separate instances are created", () => {
                    result1.should.not.equal(result2);
                });

                when("inner container is disposed", () => {
                    inner.dispose();

                    then("object resolved from outer container is not disposed", () => {
                        result1.disposeMethod.should.not.have.been.called;
                    });

                    then("object resolved from inner container is disposed", () => {
                        result2.disposeMethod.should.have.been.called;
                    });
                });

                when("outer container is disposed", () => {
                    outer.dispose();

                    then("object resolved from outer container is disposed", () => {
                        result1.disposeMethod.should.have.been.called;
                    });

                    then("object resolved from inner container is disposed", () => {
                        result2.disposeMethod.should.have.been.called;
                    });
                });
            });

            assertFactoryFunctionLifeTime(outer);
        }
    });

    describe("errors", () => {
        when("container built with nothing registered", () => {
            let sut = new inject.Container();

            when("resolving an unregistered name", () => {
                let action = (function () { sut.resolve('foo'); });

                it("throws with name in message", () => {
                    action.should.throw("Failed to resolve key 'foo'");
                });
            });

            when("resolving type with an unregistered named dependency", () => {
                @inject.Injectable
                class typeWithNamedDependency {
                    constructor(@inject.Named('unregistered')  d1: any) { }
                }
                let action = () => { sut.resolve(typeWithNamedDependency); };

                it("throws with resolve chain in message", () => {
                    action.should.throw("Failed to resolve key 'unregistered'"
                        + " while attempting to resolve typeWithNamedDependency");
                });
            });

            when("resolving null", () => {
                let action = () => { sut.resolve(null as any); };

                it("throws with null in message", () => {
                    action.should.throw("Tried to resolve 'null'");
                });
            });

            then("resolving undefined", () => {
                let action = () => { sut.resolve(undefined as any); };

                it("throws with undefined in message", () => {
                    action.should.throw("Tried to resolve 'undefined'");
                });
            });
        });

        when("resolving to undefined", () => {
            let sut = new inject.Container([inject.bind(type).to(() => undefined as any)]);
            let action = function () { sut.resolve(type); };

            it("throws with undefined in message", () => {
                action.should.throw("type resolved to undefined");
            });
        });

        when("resolving to wrong type", () => { // FIXME this should work now, to allow for abstract classes as interfaces
            let sut = new inject.Container([inject.bind(type).to(function () { return {} as any; })]);
            let action = function () { sut.resolve(type); };

            it("throws", () => {
                action.should.throw('Value does not inherit from type');
            });
        });

        when("resolving named dependency to wrong type", () => {
            inject.Injectable
            class TypeWithNamedDependency {
                constructor(@inject.Named('foo') dep: type) { }
            }
            let sut = new inject.Container([inject.bind('foo').toValue({})]);
            let action = () => sut.resolve(TypeWithNamedDependency);

            it("throws", () => {
                action.should.throw('Value does not inherit from type');
            });
        });

        when("resolving type whose dependency resolves to undefined", () => {
            let sut = new inject.Container([
                inject.bind(dependency1).to(() => undefined as any)
            ]);
            let action = () => sut.resolve(typeWithDependencies);

            it("throws with resolve chain in message", () => {
                action.should.throw("dependency1 resolved to undefined"
                    + " while attempting to resolve typeWithDependencies");
            });
        });

        when("resolve error occurs with multiple resolves in chain", () => {
            @inject.Injectable
            class three { constructor(@inject.Named('four') d: any) { } }
            class two { constructor(@inject.Named('three') d: any) { } }
            class one { constructor(d: two) { } }

            let sut = new inject.Container([
                inject.bind('three').toType(three),
                inject.bind('four').to(() => undefined as any)
            ]);

            let action = () => sut.resolve(one);

            it("throws with each dependency in chain", () => {
                action.should.throw("'four' resolved to undefined"
                    + " while attempting to resolve one -> two -> 'three'");
            });
        });

        when("binding an object", () => {
            let action = function () { inject.bind({} as any); };

            it("throws", () => {
                action.should.throw(String({}) + ' is not a valid key to bind to');
            });
        });

        when("configuring type registration", () => {
            let registration = inject.bind(type);

            when("creating a non-function", () => {
                let action = function () { registration.toType('type' as any); };

                it("throws", () => {
                    action.should.throw('Constructor is not a function');
                });
            });

            when("creating an unnamed non-subtype", () => { // FIXME: this needs to work for abstract classes as interfaces
                let action = function () { registration.toType(function () { }); };

                it("throws", () => {
                    action.should.throw('Anonymous type does not inherit from type');
                });
            });

            when("creating a named non-subtype", () => { // FIXME: this needs to work for abstract classes as interfaces
                let action = function () { registration.toType(function nonSubType() { }); };

                it("throws with non-subtype name in message", () => {
                    action.should.throw('nonSubType does not inherit from type');
                });
            });

            when("using an undefined value", () => {
                let action = function () { registration.toValue(undefined as any); };

                it("throws", () => {
                    action.should.throw('Value is undefined');
                });
            });

            when("using a value of the wrong type", () => { // FIXME: this needs to work for abstract classes as interfaces
                let action = function () { registration.toValue({}); };

                it("throws", () => {
                    action.should.throw('Value does not inherit from type');
                });
            });

            when("calling a non-function", () => {
                let action = function () { registration.to({} as any); };

                it("throws", () => {
                    action.should.throw('Factory is not a function');
                });
            });

            when("resolving to a function", () => {
                let action = function () { registration.toFunction(function () { }); };

                it("throws", () => {
                    action.should.throw("Only strings and symbols can be bound to functions");
                });
            });

            when("using parameter hook with non-function", () => {
                let action = function () { registration.useParameterHook({} as any); };

                it("throws", () => {
                    action.should.throw('Parameter hook is not a function');
                });
            });
        });

        when("registering a typed parameter with wrong type", () => { // FIXME: this needs to work for abstract classes as interfaces
            let registration = inject.bind('foo');
            let action = function () { registration.withDependency(type, {}); };

            it("throws", () => {
                action.should.throw("Value does not inherit from type");
            });
        });

        when("specifying undefined dependency for named function", () => { // FIXME: was for ctor
            let action = specifyUndefinedDependency(function UndefinedDependencyType(u: any) { });

            it("throws", () => {
                action.should.throw('UndefinedDependencyType has an undefined dependency');
            });
        });

        when("specifying undefined dependency for unnamed function", () => { // FIXME: was for ctor
            let action = specifyUndefinedDependency(function (u: any) { });

            it("throws", () => {
                action.should.throw('Type has an undefined dependency');
            });
        });

        function specifyUndefinedDependency(constructor: Function) {
            return function () { inject.dependant([undefined as any], constructor); };
        }

        when("specifying wrong number of dependencies in constructor", () => { // FIXME: was for ctor
            it("throws", () => {
                (function () {
                    inject.dependant(['foo', 'bar'], function (baz: any) { });
                }).should.throw("Type has 2 dependencies, but 1 parameter");

                (function () {
                    inject.dependant(['foo'], function () { });
                }).should.throw("Type has 1 dependency, but 0 parameters");
            });
        });

        when("specifying too many dependencies in dependant function", function () { // FIXME: was for ctor
            it("throws", function () {
                (function () {
                    inject.dependant(['foo', 'bar'], function (baz: any) { });
                }).should.throw("Type has more dependencies than parameters");
            });
        });
    });

    function isABinding(registration: inject.Binding<any>) {
        then("binding is returned", () => {
            registration.should.be.an.instanceOf(inject.Binding);
        });
    }

    function assertFactoryFunctionLifeTime(sut: inject.Container) {
        when("factory function resolved", () => {
            let funcDef = inject.makeFactory(disposableType);
            let func = sut.resolve(funcDef);

            when("factory function called twice", () => {
                let result1 = func();
                let result2 = func();

                it("returns separate instances", () => {
                    result1.should.not.equal(result2);
                });
            });
        });
    }

    function assertFactoryFunctionDependencyResolution(sut: inject.Container) {
        when("resolving factory function with partial parameters", () => {
            let factory = sut.resolve(inject.makeFactory(typeWithDependencies, [dependency2]));

            when("calling factory function", () => {
                let dependency2Instance1 = new dependency2();
                let dependency2Instance2 = new dependency2();
                let result1 = factory(dependency2Instance1);
                let result2 = factory(dependency2Instance2);

                then("type constructed with passed in dependencies", () => {
                    result1.dependency2.should.equal(dependency2Instance1);
                    result2.dependency2.should.equal(dependency2Instance2);
                });
            });
        });
    }
});

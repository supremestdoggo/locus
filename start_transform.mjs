import { ClassPrototype, FunctionPrototype, IdentifierExpression } from "assemblyscript"
import { Transform } from "assemblyscript/transform"
import binaryen from "binaryen"

/* StartTransform */
// implements a custom @start decorator for the start function
// also, start functions need to be exported, or AssemblyScript doesn't compile them because of tree-shaking

class StartTransform extends Transform {
  start_func = "";
  fatal = false;

  afterInitialize(program) {
    program.elementsByName.forEach((element) => {
      if (!(element instanceof FunctionPrototype)) return
      if (!element.decoratorNodes) return
  
      // Loop over all the decorators
      for (const node of element.decoratorNodes) {
        if (!(node.name instanceof IdentifierExpression)) continue
  
        if (node.name.text === "start" && !this.fatal) {
          if (!this.start_func) this.start_func = element.internalName;
          else {
            this.log("Error: Cannot have multiple start functions!");
            fatal = true;
          }
        }
      }
    })
  }

  afterCompile(as_module) {
    if (!this.fatal && this.start_func) {
      var module = binaryen.wrapModule(as_module.ref);
      as_module.setStart(as_module.getFunction(this.start_func));
    }
  }
}
export default StartTransform
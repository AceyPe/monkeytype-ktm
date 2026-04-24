import { extendConfig } from "@monkeytype/tsup-config";

export default extendConfig(() => ({
  entry: ["src/index.ts", "src/*.ts", "src/*/index.ts"],
}));

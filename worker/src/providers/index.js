import * as deepseek from "./deepseek.js";

// 以后加新模型：在这里登记一下就行
const PROVIDERS = { deepseek };

export function getProvider(env) {
  return PROVIDERS[env.PROVIDER || "deepseek"] || deepseek;
}

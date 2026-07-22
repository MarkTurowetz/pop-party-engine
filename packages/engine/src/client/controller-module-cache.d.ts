export interface ControllerModuleCache { get<T>(key: string, factory: () => T): T; }
export function createControllerModuleCache(): ControllerModuleCache;

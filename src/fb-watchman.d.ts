declare module "fb-watchman" {
  interface CapabilityCheckOptions {
    optional: string[];
    required: string[];
  }

  interface WatchProjectResponse {
    watch: string;
    relative_path?: string;
    warning?: string;
  }

  interface FileEvent {
    name: string;
    exists: boolean;
    type?: string;
    new?: boolean;
  }

  interface SubscriptionEvent {
    subscription: string;
    clock?: string;
    files?: FileEvent[];
  }

  class Client {
    on(event: "error", handler: (err: Error) => void): void;
    on(event: "subscription", handler: (evt: SubscriptionEvent) => void): void;
    on(event: string, handler: (data: unknown) => void): void;
    capabilityCheck(opts: CapabilityCheckOptions, callback: (err: Error | null) => void): void;
    command(args: ["watch-project", string], callback: (err: Error | null, resp: WatchProjectResponse) => void): void;
    command(args: ["subscribe", string, string, Record<string, unknown>], callback: (err: Error | null) => void): void;
    command(args: unknown[], callback: (err: Error | null, resp?: unknown) => void): void;
    end(): void;
  }
}

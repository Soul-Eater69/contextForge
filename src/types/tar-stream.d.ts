declare module "tar-stream" {
  interface ExtractStream {
    on(event: "entry", listener: (header: any, stream: any, next: () => void) => void): this;
    on(event: "finish" | "error", listener: (...args: any[]) => void): this;
    end(buffer: Buffer): void;
  }

  const tar: {
    extract(): ExtractStream;
  };

  export default tar;
}

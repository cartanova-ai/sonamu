export type FastifyFile = {
  name: string;
  data: any;
  size: number;
  encoding: string;
  tempFilePath?: string;
  truncated: boolean;
  mimetype: string;
  md5: string;
  mv: (filePath: string) => Promise<any>;
};

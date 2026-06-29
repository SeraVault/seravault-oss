import { backendService } from './backend/BackendService';

// Upload a File object and return the storage path
export const uploadFile = async (file: File, pathPrefix: string): Promise<string> => {
  const fileName = `${Date.now()}_${file.name}`;
  const fullPath = `${pathPrefix}${fileName}`;
  
  const arrayBuffer = await file.arrayBuffer();
  await backendService.storage.upload(fullPath, new Uint8Array(arrayBuffer));
  return fullPath;
};

// Upload raw data to a specific path
export const uploadFileData = async (path: string, data: ArrayBuffer): Promise<void> => {
  await backendService.storage.upload(path, new Uint8Array(data));
};

export const getFile = async (path: string): Promise<ArrayBuffer> => {
  const data = await backendService.storage.download(path);
  return data.buffer;
};

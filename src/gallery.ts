import fs from "fs";
import path from "path";
import crypto from "crypto";
import {Readable} from "stream";
import {File, Storage} from "@google-cloud/storage";

export interface AlbumsCollection {
    create(name: string): Promise<Album | null>;

    get(name: string): Promise<Album | null>;

    list(): Promise<Array<Album>>;
}

interface ImagesCollection {
    create(image: string, data: Readable): Promise<Image>;

    list(): Promise<Array<Image>>;

    move(image: string, album: string): Promise<void>;

    delete(image: string): Promise<void>;
}

class GoogleAlbumsCollection implements AlbumsCollection {
    constructor(private readonly storage: Storage) {
    }

    async create(name: string): Promise<Album | null> {
        await this.storage.createBucket(name);

        return this.get(name);
    }

    async list(): Promise<Array<Album>> {
        const [buckets] = await this.storage.getBuckets();

        return buckets.map((bucket) => new AlbumInstance(bucket.name, new GoogleImagesCollection(bucket.name, this.storage)))
    }

    async get(name: string): Promise<Album | null> {
        const [isExists] = await this.storage.bucket(name).exists();

        if (!isExists) {
            return null;
        }

        return new AlbumInstance(name, new GoogleImagesCollection(name, this.storage));
    }
}

class GoogleImagesCollection implements ImagesCollection {
    constructor(private readonly album: string, private readonly storage: Storage) {
    }

    async create(image: string, data: Readable): Promise<Image> {
        const bucket = this.storage.bucket(this.album);
        const tempFileName = await this.writeStreamToTempFile(data, image.split(".").pop() || "jpg");

        let file: File | undefined;

        try {
            [file] = await bucket.upload(tempFileName, {
                public: true,
                metadata: {metadata: {description: "Some description"}}
            });
        } finally {
            await this.deleteTempFile(tempFileName);
        }

        if (!file || !file.metadata.mediaLink) {
            throw Error("Unknown upload error");
        }

        return new ImageInstance(file.name, file.metadata.mediaLink, file.metadata.mediaLink);
    }

    async list(): Promise<Array<Image>> {
        const bucket = this.storage.bucket(this.album);

        const result = [];

        const [files] = await bucket.getFiles();

        for (const file of files) {
            result.push(new ImageInstance(file.name, file.metadata.mediaLink, file.metadata.mediaLink));
        }

        return result;
    }

    async move(image: string, album: string): Promise<void> {
        const bucket = this.storage.bucket(this.album);

        await bucket.file(image).copy(this.storage.bucket(album).file(image));
        await bucket.file(image).delete();
    }

    async delete(image: string): Promise<void> {
        await this.storage.bucket(this.album).file(image).delete();
    }

    private async writeStreamToTempFile(input: Readable, extension: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const outFileName = path.join(__dirname, `../temp/${crypto.randomBytes(16).toString("hex")}.${extension}`);
            const outFile = fs.createWriteStream(outFileName);

            input.pipe(outFile);

            outFile.on("close", () => {
                resolve(outFileName);
            });
            outFile.on("error", (error) => reject(error));
        });
    }

    private async deleteTempFile(name: string): Promise<void> {
    }
}

export abstract class Album {
    public abstract name: string;
    public abstract images: ImagesCollection;
}

export abstract class Image {
    public abstract url: string;
    public abstract name: string;
    public abstract preview: string;
}

class AlbumInstance extends Album {
    constructor(
        public readonly name: string,
        public readonly images: ImagesCollection) {
        super();
    }
}

class ImageInstance extends Image {
    constructor(public readonly name: string, public readonly url: string, public readonly preview: string) {
        super();
    }
}

export enum StorageType {
    GoogleStorage
}

export class AlbumCollectionFactory {
    static make(type: StorageType): AlbumsCollection {
        if (type === StorageType.GoogleStorage) {
            return new GoogleAlbumsCollection(new Storage({
                projectId: "orbital-ability-269309",
                keyFilename: path.join(__dirname, "../storage-key-file.json")
            }));
        } else {
            throw Error("Wrong storage type")
        }
    }
}

import fs from "fs";
import path from "path";
import Busboy from "busboy";
import {Readable} from "stream";
import {json} from "body-parser";
import express, {Request, Response} from "express";

import {Album, AlbumCollectionFactory, AlbumsCollection, Image, StorageType} from "./gallery";

const APPLICATION_PORT = 3000;

const application = express();

application.use(json());

if (!fs.existsSync(path.join(__dirname, "../temp"))) {
    fs.mkdirSync(path.join(__dirname, "../temp"));
}

class GalleryController {
    constructor(private readonly albums: AlbumsCollection) {
    }

    async createAlbum(album: string) {
        await this.albums.create(album);
    }

    async uploadImage(image: string, toAlbum: string, data: Readable): Promise<Image | null> {
        const album = await this.albums.get(toAlbum);

        if (!album) {
            return null;
        }

        return album.images.create(image, data);
    }

    async getAlbums(): Promise<Array<{ name: string }>> {
        return (await this.albums.list()).map((album: Album) => ({name: album.name}));
    }

    async getAlbum(fromAlbum: string): Promise<{ name: string, images: Array<Image> } | null> {
        const album = await this.albums.get(fromAlbum);

        if (!album) {
            return null;
        }

        return {
            name: album.name,
            images: await album.images.list()
        };
    }
}

const controller = new GalleryController(AlbumCollectionFactory.make(StorageType.GoogleStorage));

application.post("/gallery/:album", async (req: Request, res: Response) => {
    await controller.createAlbum(req.params.album);

    return res.sendStatus(200);
});

application.post("/gallery/:album/image", async (req: Request, res: Response) => {
    const busboy = new Busboy({headers: req.headers});

    let image: Image | null = null;

    busboy.on("file", (async (field, file, filename) => {
        image = await controller.uploadImage(filename, req.params.album, file as Readable);

        if (!image) {
            res.sendStatus(404);
        } else {
            res.send(image);
        }
    }));

    return req.pipe(busboy);
});

application.get("/gallery", async (req: Request, res: Response) => {
    return res.send({albums: await controller.getAlbums()});
});

application.get("/gallery/:album", async (req: Request, res: Response) => {
    const album = await controller.getAlbum(req.params.album);

    if (!album) {
        return res.sendStatus(404);
    }

    return res.send(album);
});

application.listen(APPLICATION_PORT, () => console.log(`Server started at port ${APPLICATION_PORT}`));

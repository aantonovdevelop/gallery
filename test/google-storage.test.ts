import fs from "fs";
import path from "path";
import assert from "assert";
import {Storage} from "@google-cloud/storage";

import {AlbumCollectionFactory, StorageType} from "../src/gallery";

const storage = new Storage({
    projectId: "orbital-ability-269309",
    keyFilename: path.join(__dirname, "../storage-key-file.json")
});

describe("google-storage", function () {
    this.timeout(15000);

    const firstAlbumName = "first_album";
    const secondAlbumName = "second_album";

    const testImagePath = "./data/image.jpg";

    const albums = AlbumCollectionFactory.make(StorageType.GoogleStorage);

    before(() => {
        if (!fs.existsSync(path.join(__dirname, "../temp"))) {
            fs.mkdirSync(path.join(__dirname, "../temp"));
        }
    });

    it("should create an album and few images", async function () {
        const album = await albums.create(firstAlbumName);

        if (!album) {
            throw Error("Album isn't instantiated");
        }

        await album.images.create("image.jpg", fs.createReadStream(path.join(__dirname, testImagePath)));
        const images = await album.images.list();

        assert.strictEqual(images.length, 1);
    });

    it("should move image from one album to another", async function () {
        const sourceAlbum = await albums.create(firstAlbumName);
        const destinationAlbum = await albums.create(secondAlbumName);

        if (!sourceAlbum || !destinationAlbum) {
            throw Error("Albums isn't instantiated");
        }

        await sourceAlbum?.images.create("image.jpg", fs.createReadStream(path.join(__dirname, testImagePath)));

        const firstAlbumImages = await sourceAlbum?.images.list();

        assert.strictEqual(firstAlbumImages?.length, 1);

        await sourceAlbum?.images.move(firstAlbumImages[0].name, destinationAlbum.name);

        const updatedFirstAlbumImages = await sourceAlbum.images.list();
        const secondAlbumImages = await destinationAlbum.images.list();

        assert.strictEqual(updatedFirstAlbumImages.length, 0);
        assert.strictEqual(secondAlbumImages.length, 1);
    });

    afterEach(async function () {
        const firstAlbum = storage.bucket(firstAlbumName);
        const secondAlbum = storage.bucket(secondAlbumName);

        const [firstAlbumExists] = await firstAlbum.exists();

        if (firstAlbumExists) {
            await firstAlbum.deleteFiles({force: true});
            await firstAlbum.delete();
        }

        const [secondAlbumExists] = await secondAlbum.exists();

        if (secondAlbumExists) {
            await secondAlbum.deleteFiles({force: true});
            await secondAlbum.delete();
        }
    });
});

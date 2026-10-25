import sharp from 'sharp';
import { v4 as uuid } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const HUGIN_BIN = '/usr/bin';

export async function autoPlanFromImage(inputPath, outDir) {
    const out = `${outDir}/autoplan-${uuid().slice(0, 8)}.png`;
    const meta = await sharp(inputPath).metadata();
    const w = Math.min(meta.width, 1600);
    const h = Math.round(meta.height * (w / meta.width));
    await sharp(inputPath)
        .resize(w, h, { fit: 'inside' })
        .grayscale()
        .normalise()
        .convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] })
        .threshold(40)
        .png({ compressionLevel: 9 })
        .toFile(out);
    return out;
}

export async function build3DFromPhotos(files, outDir) {
    const id = uuid().slice(0, 8);
    const outPath = path.resolve(outDir, `pano-${id}.jpg`);
    const projectFile = path.resolve(outDir, `project-${id}.pto`);
    const workDir = path.dirname(outPath);

    try {
        console.log(`Начинаю склейку ${files.length} фото...`);

        // 1. Сжимаем и ПРИВОДИМ ВСЕ ФОТО К ОДНОМУ РАЗМЕРУ (1200x600)
        const resizedFiles = [];
        for (let i = 0; i < files.length; i++) {
            const resizedPath = path.resolve(workDir, `resized-${id}-${i}.jpg`);
            await sharp(files[i])
                .resize(1200, 600, { fit: 'cover', position: 'centre' }) 
                .jpeg({ quality: 80 })
                .toFile(resizedPath);
            resizedFiles.push(resizedPath);
        }

        // 2. Создаем файл проекта
        let ptoContent = `p f2 w1200 h600 v360 n"JPEG q90"\n\n`;
        resizedFiles.forEach(f => {
            ptoContent += `i w1200 h600 f2 v180 a0 b0 c0 d0 e0 g0 p0 r0 t0 n"${path.resolve(f)}"\n`;
        });
        await fs.writeFile(projectFile, ptoContent);

        console.log('Поиск общих точек (cpfind)...');
        await execPromise(`"${path.join(HUGIN_BIN, 'cpfind')}" --multirow -o "${projectFile}" "${projectFile}"`, { cwd: workDir });

        console.log('Выравнивание (autooptimiser)...');
        await execPromise(`"${path.join(HUGIN_BIN, 'autooptimiser')}" -a -m -l -s -o "${projectFile}" "${projectFile}"`, { cwd: workDir });

        console.log('Финальная сшивка (hugin_executor)...');
        const prefix = `result-${id}`;
        await execPromise(`"${path.join(HUGIN_BIN, 'hugin_executor')}" -p "${prefix}" -s "${projectFile}"`, { cwd: workDir });

        const filesInDir = await fs.readdir(workDir);
        const resultFile = filesInDir.find(f => f.startsWith(prefix) && (f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.tif')));
        if (!resultFile) throw new Error('Hugin не создал файл результата');

        const extractedImagePath = path.resolve(workDir, resultFile);
        await sharp(extractedImagePath).jpeg({ quality: 90 }).toFile(outPath);

        await fs.unlink(projectFile).catch(() => {});
        await fs.unlink(extractedImagePath).catch(() => {});
        for (const f of resizedFiles) await fs.unlink(f).catch(() => {});

        console.log('✅ Панорама успешно склеена!');
        return path.basename(outPath);

    } catch (e) {
        console.error('⚠️ Ошибка Hugin:', e.message);
        
        console.log('Делаю простой коллаж...');
        const metas = await Promise.all(files.map(f => sharp(f).metadata()));
        const maxH = Math.max(...metas.map(m => m.height));
        const resized = await Promise.all(files.map(f => sharp(f).resize({ height: maxH }).toBuffer({ resolveWithObject: true })));
        const totalW = resized.reduce((s, r) => s + r.info.width, 0);
        const composites = [];
        let x = 0;
        for (const r of resized) {
            composites.push({ input: r.data, left: x, top: 0 });
            x += r.info.width;
        }
        const collageBuf = await sharp({ create: { width: totalW, height: maxH, channels: 3, background: '#000' } }).composite(composites).jpeg({ quality: 85 }).toBuffer();
        await sharp(collageBuf).jpeg({ quality: 90 }).toFile(outPath);
        return path.basename(outPath);
    }
}

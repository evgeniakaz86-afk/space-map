import sharp from 'sharp';
import { v4 as uuid } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import AdmZip from 'adm-zip';

const execPromise = util.promisify(exec);

// Путь к папке с Hugin (проверь, что он правильный на твоем ПК)
const HUGIN_BIN = 'C:\\Program Files\\Hugin\\bin';
const HUGIN_EXE = path.join(HUGIN_BIN, 'hugin_executor.exe');

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
    const zipFile = path.resolve(outDir, `pano-${id}.zip`);
    const workDir = path.dirname(outPath);

    try {
        console.log('Начинаю склейку через Hugin Executor...');

        // 1. Создаем файл проекта (список фото)
        let ptoContent = `p f2 w3000 h1500 v360 n"JPEG q90"\n\n`;
        files.forEach(f => {
            ptoContent += `i w3000 h1500 f2 v180 a0 b0 c0 d0 e0 g0 p0 r0 t0 n"${path.resolve(f)}"\n`;
        });
        await fs.writeFile(projectFile, ptoContent);

        // 2. Ищем общие точки (cpfind)
        console.log('Поиск общих точек (cpfind)...');
        await execPromise(`"${path.join(HUGIN_BIN, 'cpfind.exe')}" --multirow -o "${projectFile}" "${projectFile}"`, { cwd: workDir });

        // 3. Выравниваем (autooptimiser)
        console.log('Выравнивание (autooptimiser)...');
        await execPromise(`"${path.join(HUGIN_BIN, 'autooptimiser.exe')}" -a -m -l -s -o "${projectFile}" "${projectFile}"`, { cwd: workDir });

        // 4. Запускаем финальную склейку (hugin_executor)
        console.log('Финальная сшивка (hugin_executor)...');
        await execPromise(`"${HUGIN_EXE}" -p "${projectFile}" -z -o "${zipFile}"`, { cwd: workDir });

        // 5. Распаковываем ZIP и достаем картинку
        console.log('Распаковка результата...');
        const zip = new AdmZip(zipFile);
        const zipEntries = zip.getEntries();
        let extractedImagePath = null;

        for (const entry of zipEntries) {
            if (entry.entryName.endsWith('.jpg') || entry.entryName.endsWith('.png') || entry.entryName.endsWith('.tif')) {
                const targetPath = path.resolve(workDir, `hugin-result-${id}${path.extname(entry.entryName)}`);
                await fs.writeFile(targetPath, entry.getData());
                extractedImagePath = targetPath;
                break;
            }
        }

        if (!extractedImagePath) throw new Error('В архиве не найдено изображение');

        // 6. Конвертируем в JPG и делаем КВАДРАТ
        console.log('Финальная обработка (квадрат)...');
        await sharp(extractedImagePath)
            .resize(2048, 2048, { fit: 'cover', position: 'centre' }) // Вырезаем центр квадрата
            .jpeg({ quality: 90 })
            .toFile(outPath);

        // Удаляем временные файлы
        await fs.unlink(projectFile).catch(() => {});
        await fs.unlink(zipFile).catch(() => {});
        await fs.unlink(extractedImagePath).catch(() => {});

        console.log('✅ Панорама успешно склеена!');
        return outPath;

    } catch (e) {
        console.error('⚠️ Ошибка Hugin:', e.message);
        
        // === ЗАПАСНОЙ ВАРИАНТ (коллаж) ===
        console.log('Делаю простой коллаж...');
        const metas = await Promise.all(files.map(f => sharp(f).metadata()));
        const maxH = Math.max(...metas.map(m => m.height));
        
        const resized = await Promise.all(
            files.map(f => sharp(f).resize({ height: maxH }).toBuffer({ resolveWithObject: true }))
        );
        
        const totalW = resized.reduce((s, r) => s + r.info.width, 0);
        const composites = [];
        let x = 0;
        
        for (const r of resized) {
            composites.push({ input: r.data, left: x, top: 0 });
            x += r.info.width;
        }
        
        const collageBuf = await sharp({
            create: { width: totalW, height: maxH, channels: 3, background: '#000' }
        }).composite(composites).jpeg({ quality: 85 }).toBuffer();

        // Квадрат для коллажа
        await sharp(collageBuf)
            .resize(2048, 2048, { fit: 'cover', position: 'centre' })
            .jpeg({ quality: 90 })
            .toFile(outPath);

        return outPath;
    }
}
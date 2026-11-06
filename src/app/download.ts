/**
 * Saves bytes as a file through a temporary link.
 * Сохраняет байты файлом через временную ссылку.
 */
export function downloadBlob(filename: string, data: BlobPart, type: string): void {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();

    // The browser needs a moment to start the download before the link may go.
    // Браузеру нужно мгновение, чтобы начать скачивание, прежде чем ссылку можно отпустить.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

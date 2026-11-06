import { analyze, detectSprites, spriteAt } from '../../core/detect';
import type { ImageLike } from '../../core/types';
import type { WorkerIn, WorkerOut } from './protocol';

// The page's tsconfig has the DOM lib, where `self` is a Window; the worker's own scope is typed by hand.
// В tsconfig страницы подключена библиотека DOM, где `self` — это Window; область воркера описана руками.
const scope = self as unknown as {
    onmessage: ((event: MessageEvent<WorkerIn>) => void) | null;
    postMessage(message: WorkerOut): void;
};

let image: ImageLike | null = null;

scope.onmessage = (event) => {
    const message = event.data;

    if (message.type === 'image') {
        image = { width: message.width, height: message.height, data: new Uint8ClampedArray(message.buffer) };
        return;
    }

    try {
        if (!image) throw new Error('No image has been sent yet');
        if (message.type === 'at') {
            // The sprite under the click, whatever its size: the size limits are for the automatic search only.
            // Спрайт под кликом, любого размера: ограничения по размеру только для автоматического поиска.
            const { keys, minAlpha, gap } = message.options;
            scope.postMessage({ type: 'found', id: message.id, sprite: spriteAt(analyze(image, { keys, minAlpha, gap }), message.x, message.y) });
            return;
        }

        const { sprites, total } = detectSprites(image, message.options);
        scope.postMessage({ type: 'result', id: message.id, sprites, total });
    } catch (error) {
        scope.postMessage({ type: 'error', id: message.id, message: error instanceof Error ? error.message : String(error) });
    }
};

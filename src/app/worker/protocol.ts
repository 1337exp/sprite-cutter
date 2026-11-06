import type { DetectOptions, Sprite } from '../../core';

/**
 * What the page says to the search worker. The image is sent once; after that only options travel.
 * Что страница говорит воркеру поиска. Картинка отправляется один раз; дальше ездят только параметры.
 */
export type WorkerIn =
    | { type: 'image'; width: number; height: number; buffer: ArrayBuffer }
    | { type: 'detect'; id: number; options: DetectOptions }
    | { type: 'at'; id: number; options: DetectOptions; x: number; y: number };

export type WorkerOut =
    | { type: 'result'; id: number; sprites: Sprite[]; total: number }
    | { type: 'found'; id: number; sprite: Sprite | null }
    | { type: 'error'; id: number; message: string };

<script setup lang="ts">
import { TaoButton } from '@1337exp/taoui';
import { clampZoom, createCamera, panBy, screenToWorld, zoomAt, zoomLimits, type Camera } from '@1337exp/taoux/camera';
import { wheelIntent } from '@1337exp/taoux/wheel';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { t } from '../i18n';
import type { LoadedSheet } from '../sheet';
import type { SpriteEntry } from '../workspace';

const props = defineProps<{
    sheet: LoadedSheet | null;
    entries: SpriteEntry[];
    hovered: number | null;
    picking: boolean;
}>();

const emit = defineEmits<{
    toggle: [index: number];
    hover: [index: number | null];
    pick: [x: number, y: number];
    open: [file: File];
}>();

// Pixel art is looked at from far (a sheet of thousands of pixels) and from very close (one pixel is a block).
// Пиксель-арт смотрят и издалека (лист в тысячи пикселей), и вплотную (один пиксель — это квадрат).
const LIMITS = zoomLimits({ min: 0.02, max: 64 });
const FIT_MARGIN = 24;
const CLICK_SLOP = 4;

const root = ref<HTMLElement | null>(null);
const host = ref<HTMLElement | null>(null);
const camera = ref<Camera>(createCamera());
const size = ref({ w: 0, h: 0 });
const pointer = ref<{ x: number; y: number } | null>(null);
const dragging = ref(false);

const worldStyle = computed(() => ({
    transform: `translate(${camera.value.x}px, ${camera.value.y}px) scale(${camera.value.z})`,
    '--z': String(camera.value.z),
    // frame lines keep their on-screen thickness whatever the zoom
    // линии рамок сохраняют толщину на экране при любом масштабе
    '--stroke': String(1.5 / camera.value.z),
}));

const zoomText = computed(() => `${Math.round(camera.value.z * 100)}%`);

/**
 * Centres the picture and scales it to fit. From 100% up only whole steps, so pixels stay square blocks.
 * Центрирует картинку и вписывает её. От 100% и выше только целыми шагами, чтобы пиксели остались квадратами.
 */
function fit(): void {
    const sheet = props.sheet;
    if (!sheet || size.value.w === 0 || size.value.h === 0) return;

    const { width, height } = sheet.image;
    const room = Math.min((size.value.w - FIT_MARGIN * 2) / width, (size.value.h - FIT_MARGIN * 2) / height);
    const z = clampZoom(room >= 1 ? Math.floor(room) : room, LIMITS);

    camera.value = { z, x: (size.value.w - width * z) / 2, y: (size.value.h - height * z) / 2 };
}

watch(
    [() => props.sheet, host],
    ([sheet, element]) => {
        if (!element) return;
        if (sheet) element.replaceChildren(sheet.canvas);
        else element.replaceChildren();
    },
    { immediate: true, flush: 'post' },
);

watch(() => props.sheet?.id, fit, { flush: 'post' });

let observer: ResizeObserver | null = null;

onMounted(() => {
    observer = new ResizeObserver(([entry]) => {
        const first = size.value.w === 0;
        size.value = { w: entry!.contentRect.width, h: entry!.contentRect.height };
        if (first) fit();
    });
    observer.observe(root.value!);
});

onBeforeUnmount(() => observer?.disconnect());

// ---- the pointer ------------------------------------------------------------------------------------------

function local(event: MouseEvent): { x: number; y: number } {
    const box = root.value!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
}

function world(event: MouseEvent): { x: number; y: number } {
    const point = local(event);
    const [x, y] = screenToWorld(camera.value, point.x, point.y);
    return { x: Math.floor(x), y: Math.floor(y) };
}

/**
 * The smallest frame under the point, so a small sprite inside a big one can still be reached.
 * Самая маленькая рамка под точкой, чтобы до маленького спрайта внутри большого можно было добраться.
 */
function frameAt(x: number, y: number): number | null {
    let found: number | null = null;
    let smallest = Infinity;

    for (let i = 0; i < props.entries.length; i++) {
        const r = props.entries[i]!.rect;
        if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h && r.w * r.h < smallest) {
            found = i;
            smallest = r.w * r.h;
        }
    }

    return found;
}

let drag: { id: number; x: number; y: number; cameraX: number; cameraY: number; button: number; moved: boolean } | null = null;

function onPointerDown(event: PointerEvent): void {
    if (!props.sheet) return;

    root.value!.setPointerCapture(event.pointerId);
    const point = local(event);
    drag = { id: event.pointerId, x: point.x, y: point.y, cameraX: camera.value.x, cameraY: camera.value.y, button: event.button, moved: false };
}

function onPointerMove(event: PointerEvent): void {
    if (!props.sheet) return;

    const at = world(event);
    pointer.value = at;

    if (drag && drag.id === event.pointerId) {
        const point = local(event);
        const dx = point.x - drag.x;
        const dy = point.y - drag.y;

        if (!drag.moved && Math.hypot(dx, dy) > CLICK_SLOP) {
            drag.moved = true;
            dragging.value = true;
        }
        if (drag.moved) camera.value = { ...camera.value, x: drag.cameraX + dx, y: drag.cameraY + dy };
        return;
    }

    const index = frameAt(at.x, at.y);
    if (index !== props.hovered) emit('hover', index);
}

function onPointerUp(event: PointerEvent): void {
    if (!drag || drag.id !== event.pointerId) return;

    const click = !drag.moved && drag.button === 0;
    drag = null;
    dragging.value = false;
    if (!click || !props.sheet) return;

    const at = world(event);
    if (props.picking) {
        emit('pick', at.x, at.y);
        return;
    }

    const index = frameAt(at.x, at.y);
    if (index !== null) emit('toggle', index);
}

function onPointerLeave(): void {
    pointer.value = null;
    if (!drag && props.hovered !== null) emit('hover', null);
}

function onWheel(event: WheelEvent): void {
    if (!props.sheet) return;
    event.preventDefault();

    const point = local(event);
    const intent = wheelIntent(event, root.value!.clientHeight);

    camera.value =
        intent.kind === 'zoom' ? zoomAt(camera.value, point.x, point.y, intent.factor, LIMITS) : panBy(camera.value, intent.dx, intent.dy);
}

function onDrop(event: DragEvent): void {
    const file = event.dataTransfer?.files[0];
    if (file) emit('open', file);
}
</script>

<template>
    <div
        ref="root"
        class="viewport"
        :class="{ picking, dragging, onframe: hovered !== null && !picking }"
        @wheel="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="onPointerLeave"
        @dblclick.prevent="fit"
        @contextmenu.prevent
        @dragover.prevent
        @drop.prevent="onDrop"
    >
        <div v-show="sheet" class="world" :style="worldStyle">
            <div ref="host" class="host"></div>
            <svg
                v-if="sheet"
                class="frames"
                :width="sheet.image.width"
                :height="sheet.image.height"
                :viewBox="`0 0 ${sheet.image.width} ${sheet.image.height}`"
            >
                <rect
                    v-for="(entry, i) in entries"
                    :key="entry.key"
                    class="frame"
                    :class="{ off: !entry.included, hover: i === hovered }"
                    :x="entry.rect.x"
                    :y="entry.rect.y"
                    :width="entry.rect.w"
                    :height="entry.rect.h"
                />
            </svg>
        </div>

        <p v-if="!sheet" class="empty">{{ t('viewport.empty') }}</p>

        <div v-if="sheet" class="hud" @pointerdown.stop @dblclick.stop>
            <span class="readout">
                {{ zoomText }}<template v-if="pointer"> · {{ pointer.x }}, {{ pointer.y }}</template>
            </span>
            <TaoButton size="small" variant="secondary" :title="t('viewport.fit')" @click="fit">{{ t('viewport.fit') }}</TaoButton>
        </div>
    </div>
</template>

<style scoped>
.viewport {
    position: relative;
    overflow: hidden;
    min-height: 240px;
    background: var(--tao-color-surface-sunken);
    border: 1px solid var(--tao-color-border);
    border-radius: var(--tao-radius-panel);
    cursor: grab;
    touch-action: none;
    user-select: none;
}

.viewport.dragging {
    cursor: grabbing;
}

.viewport.onframe {
    cursor: pointer;
}

.viewport.picking {
    cursor: crosshair;
}

.world {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
}

.host {
    line-height: 0;
    background-color: var(--tao-color-surface);
    background-image: conic-gradient(var(--checker) 25%, transparent 0 50%, var(--checker) 0 75%, transparent 0);
    /* the squares keep their size on screen, however far the picture is zoomed */
    background-size: calc(16px / var(--z, 1)) calc(16px / var(--z, 1));
}

.host :deep(canvas) {
    display: block;
    image-rendering: pixelated;
}

.frames {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    overflow: visible;
}

.frame {
    fill: transparent;
    stroke: var(--tao-color-accent);
    stroke-width: var(--stroke, 1);
}

.frame.off {
    stroke: var(--tao-color-text-muted);
    stroke-dasharray: calc(4 * var(--stroke, 1)) calc(3 * var(--stroke, 1));
    opacity: 0.8;
}

.frame.hover {
    fill: var(--tao-color-accent-subtle);
    stroke-width: calc(2 * var(--stroke, 1));
}

.empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    color: var(--tao-color-text-muted);
}

.hud {
    position: absolute;
    right: 8px;
    bottom: 8px;
    left: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    pointer-events: none;
}

.hud > * {
    pointer-events: auto;
}

.readout {
    padding: 2px 8px;
    border-radius: var(--tao-radius-sm);
    background: var(--tao-color-surface);
    border: 1px solid var(--tao-color-border);
    color: var(--tao-color-text-muted);
    font-family: var(--tao-font-family-mono, monospace);
    font-size: var(--tao-font-size-xs);
}
</style>

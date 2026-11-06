<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { Rect } from '../../core';

const props = defineProps<{ source: HTMLCanvasElement; rect: Rect }>();

const WIDTH = 48;
const HEIGHT = 36;

const canvas = ref<HTMLCanvasElement | null>(null);

/**
 * Draws the sprite as large as fits, in whole steps when it can be enlarged so the pixels stay square.
 * Рисует спрайт как можно крупнее, целыми шагами, если его можно увеличить, чтобы пиксели остались квадратными.
 */
function draw(): void {
    const element = canvas.value;
    const context = element?.getContext('2d');
    if (!element || !context) return;

    const { x, y, w, h } = props.rect;
    const fit = Math.min(WIDTH / w, HEIGHT / h);
    const scale = fit >= 1 ? Math.floor(fit) : fit;
    const dw = Math.max(1, Math.round(w * scale));
    const dh = Math.max(1, Math.round(h * scale));

    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.imageSmoothingEnabled = false;
    context.drawImage(props.source, x, y, w, h, Math.floor((WIDTH - dw) / 2), Math.floor((HEIGHT - dh) / 2), dw, dh);
}

onMounted(draw);
watch(() => [props.source, props.rect.x, props.rect.y, props.rect.w, props.rect.h], draw);
</script>

<template>
    <canvas ref="canvas" class="thumb" :width="WIDTH" :height="HEIGHT"></canvas>
</template>

<style scoped>
.thumb {
    display: block;
    flex: none;
    width: 48px;
    height: 36px;
    border-radius: var(--tao-radius-sm);
    background-color: var(--tao-color-surface);
    background-image: conic-gradient(var(--checker) 25%, transparent 0 50%, var(--checker) 0 75%, transparent 0);
    background-size: 12px 12px;
}
</style>

<script setup lang="ts">
import { TaoAlert, TaoButton, TaoCheckbox, TaoInput, TaoList, TaoListItem, TaoLoader } from '@1337exp/taoui';
import { computed } from 'vue';
import { t } from '../i18n';
import { useWorkspace } from '../workspace';
import SpriteThumb from './SpriteThumb.vue';

const { sheet, entries, selected, total, busy, hovered, setAll, setHovered, downloadSprite, copySprite, removeManual } = useWorkspace();

const allChecked = computed(() => entries.value.length > 0 && selected.value.length === entries.value.length);
const someChecked = computed(() => selected.value.length > 0 && !allChecked.value);
// Sprites added by a click are not part of what the search found, so they do not count towards its limit.
// Спрайты, добавленные кликом, не входят в то, что нашёл поиск, и в его предел не считаются.
const found = computed(() => entries.value.filter((entry) => !entry.manual).length);
const capped = computed(() => total.value > found.value);
</script>

<template>
    <section class="panel sprites">
        <header class="head">
            <h2>{{ t('sprites.title') }}</h2>
            <span class="count">{{ t('sprites.selected', [selected.length, entries.length]) }}</span>
            <TaoLoader v-if="busy" variant="ring" :size="16" inline :label="t('sprites.searching')" />
        </header>

        <p v-if="!entries.length && !busy" class="empty">{{ t('sprites.none') }}</p>

        <template v-else-if="sheet">
            <TaoCheckbox :model-value="allChecked" :indeterminate="someChecked" :label="t('sprites.selectAll')" @update:model-value="setAll" />

            <TaoAlert v-if="capped" tone="info">{{ t('sprites.capped', [found, total]) }}</TaoAlert>

            <TaoList :max-height="320" :aria-label="t('sprites.title')">
                <TaoListItem
                    v-for="(entry, i) in entries"
                    :key="entry.key"
                    :active="i === hovered"
                    action-always
                    @mouseenter="setHovered(i)"
                    @mouseleave="setHovered(null)"
                >
                    <template #prefix>
                        <div class="prefix">
                            <TaoCheckbox v-model="entry.included" :aria-label="t('sprites.include')" />
                            <SpriteThumb :source="sheet.canvas" :rect="entry.rect" />
                        </div>
                    </template>

                    <TaoInput v-model="entry.name" variant="plain" :placeholder="entry.defaultName" :aria-label="t('sprites.name')" />

                    <template #description>
                        {{ entry.rect.x }}, {{ entry.rect.y }} · {{ entry.rect.w }} × {{ entry.rect.h }}<template v-if="entry.manual"> · {{ t('find.manual') }}</template>
                    </template>

                    <template #action>
                        <TaoButton v-if="entry.manual" icon="tao-close" variant="text" :aria-label="t('find.remove')" :title="t('find.remove')" @click="removeManual(entry)" />
                        <TaoButton icon="tao-copy" variant="text" :aria-label="t('sprites.copy')" :title="t('sprites.copy')" @click="copySprite(entry)" />
                        <TaoButton icon="tao-arrow-down" variant="text" :aria-label="t('sprites.download')" :title="t('sprites.download')" @click="downloadSprite(entry)" />
                    </template>
                </TaoListItem>
            </TaoList>
        </template>
    </section>
</template>

<style scoped>
.sprites {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.head {
    display: flex;
    align-items: center;
    gap: 10px;
}

.head h2 {
    margin: 0;
    font-size: var(--tao-font-size-md);
    font-weight: 600;
}

.count {
    margin-right: auto;
    color: var(--tao-color-text-muted);
    font-size: var(--tao-font-size-xs);
}

.empty {
    margin: 0;
    color: var(--tao-color-text-muted);
}

.prefix {
    display: flex;
    align-items: center;
    gap: 8px;
}
</style>

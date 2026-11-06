<script setup lang="ts">
import { TaoButton, TaoFormField, TaoInputNumber, TaoSlider } from '@1337exp/taoui';
import { computed } from 'vue';
import { t } from '../i18n';
import { useWorkspace } from '../workspace';

const { settings, resetSettings } = useWorkspace();

// The slider cannot be empty, the setting can: an empty setting means the core's default, 1.
// Бегунок не бывает пустым, настройка бывает: пустая настройка значит умолчание ядра, 1.
const alpha = computed({
    get: () => settings.minAlpha ?? 1,
    set: (value: number) => {
        settings.minAlpha = value;
    },
});
</script>

<template>
    <div class="form">
        <TaoFormField :label="t('search.minSize')">
            <div class="pair">
                <TaoInputNumber v-model="settings.minWidth" :min="1" :placeholder="t('search.width')" :aria-label="`${t('search.minSize')}: ${t('search.width')}`" />
                <span class="times" aria-hidden="true">×</span>
                <TaoInputNumber v-model="settings.minHeight" :min="1" :placeholder="t('search.height')" :aria-label="`${t('search.minSize')}: ${t('search.height')}`" />
            </div>
        </TaoFormField>

        <TaoFormField :label="t('search.maxSize')">
            <div class="pair">
                <TaoInputNumber v-model="settings.maxWidth" :min="0" :placeholder="t('search.noLimit')" :aria-label="`${t('search.maxSize')}: ${t('search.width')}`" />
                <span class="times" aria-hidden="true">×</span>
                <TaoInputNumber v-model="settings.maxHeight" :min="0" :placeholder="t('search.noLimit')" :aria-label="`${t('search.maxSize')}: ${t('search.height')}`" />
            </div>
        </TaoFormField>

        <TaoFormField :label="t('search.gap')" :hint="t('search.gapHint')">
            <TaoInputNumber v-model="settings.gap" :min="0" :max="64" />
        </TaoFormField>

        <TaoFormField :label="t('search.minAlpha')" :hint="t('search.minAlphaHint')">
            <TaoSlider v-model="alpha" :min="1" :max="255" show-value />
        </TaoFormField>

        <TaoFormField :label="t('search.limit')">
            <TaoInputNumber v-model="settings.limit" :min="1" :max="5000" />
        </TaoFormField>

        <div>
            <TaoButton variant="text" icon="tao-undo" @click="resetSettings">{{ t('search.reset') }}</TaoButton>
        </div>
    </div>
</template>

<style scoped>
.form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 12px;
}

.pair {
    display: flex;
    align-items: center;
    gap: 8px;
}

.times {
    color: var(--tao-color-text-muted);
}
</style>

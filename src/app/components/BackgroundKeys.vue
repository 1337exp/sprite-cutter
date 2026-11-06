<script setup lang="ts">
import { TaoButton, TaoColorInput, TaoSlider } from '@1337exp/taoui';
import { t } from '../i18n';
import { useWorkspace } from '../workspace';

const { keys, picking, sheet, addKey, removeKey, guessKey } = useWorkspace();
</script>

<template>
    <div class="keys">
        <div class="toolbar">
            <TaoButton variant="secondary" icon="tao-search" :disabled="!sheet" @click="guessKey">{{ t('background.guess') }}</TaoButton>
            <TaoButton v-model:pressed="picking" variant="secondary" icon="tao-eye" :disabled="!sheet">{{ t('background.pick') }}</TaoButton>
            <TaoButton variant="secondary" icon="tao-plus" @click="addKey()">{{ t('background.add') }}</TaoButton>
        </div>

        <p v-if="!keys.length" class="muted">{{ t('background.empty') }}</p>

        <div v-for="key in keys" :key="key.id" class="key">
            <TaoColorInput v-model="key.color" :aria-label="t('background.colour')" />

            <label class="tolerance">
                <span class="muted">{{ t('background.tolerance') }}</span>
                <TaoSlider v-model="key.tolerance" :min="0" :max="100" :step="1" show-value :aria-label="t('background.tolerance')" />
            </label>

            <TaoButton icon="tao-close" variant="text" :aria-label="t('background.remove')" @click="removeKey(key.id)" />
        </div>
    </div>
</template>

<style scoped>
.keys {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 12px;
}

.toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.muted {
    margin: 0;
    color: var(--tao-color-text-muted);
}

.key {
    display: flex;
    align-items: center;
    gap: 10px;
}

.tolerance {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    font-size: var(--tao-font-size-xs);
}
</style>

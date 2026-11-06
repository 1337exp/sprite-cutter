<script setup lang="ts">
import { TaoAlert, TaoButton, TaoCopy, TaoFormField, TaoInput, TaoProgress, TaoSwitch, TaoTabs } from '@1337exp/taoui';
import { computed, ref } from 'vue';
import { t } from '../i18n';
import { useWorkspace } from '../workspace';

const { sheet, selected, json, css, exportOptions, exporting, downloadZip } = useWorkspace();

const tab = ref('json');
const tabs = computed(() => [
    { value: 'json', label: t('export.json') },
    { value: 'css', label: t('export.css') },
]);

const text = computed(() => (tab.value === 'json' ? json.value : css.value));
const percent = computed(() => (exporting.total ? Math.round((exporting.done / exporting.total) * 100) : 0));
</script>

<template>
    <section class="panel export">
        <TaoTabs v-model="tab" :items="tabs">
            <div class="body">
                <div v-if="tab === 'css'" class="options">
                    <TaoFormField :label="t('export.basePath')">
                        <TaoInput v-model="exportOptions.basePath" placeholder="img/" />
                    </TaoFormField>
                    <TaoSwitch v-model="exportOptions.retina" :label="t('export.retina')" />
                    <TaoSwitch v-model="exportOptions.percent" :label="t('export.percent')" />
                </div>

                <div v-if="text" class="code">
                    <TaoCopy :text="text" class="copy" />
                    <pre>{{ text }}</pre>
                </div>
                <p v-else class="empty">{{ t('export.empty') }}</p>
            </div>
        </TaoTabs>

        <TaoAlert v-if="sheet?.includeSheet" tone="info">{{ t('export.withSheet') }}</TaoAlert>

        <TaoButton block icon="tao-arrow-down" :loading="exporting.running" :disabled="!selected.length" @click="downloadZip">
            {{ selected.length ? t('export.zip') : t('export.zipEmpty') }}
        </TaoButton>

        <div v-if="exporting.running" class="progress">
            <TaoProgress :progress="percent" :show-percentage="false" :min-width="0" />
            <span>{{ t('export.working', [exporting.done, exporting.total]) }}</span>
        </div>
    </section>
</template>

<style scoped>
.export {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 12px;
}

.options {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.code {
    position: relative;
}

.copy {
    position: absolute;
    top: 4px;
    right: 4px;
}

pre {
    max-height: 220px;
    margin: 0;
    padding: 10px 36px 10px 10px;
    overflow: auto;
    border-radius: var(--tao-radius-md);
    background: var(--tao-color-surface-sunken);
    font-family: var(--tao-font-family-mono, monospace);
    font-size: var(--tao-font-size-xs);
    white-space: pre;
}

.empty {
    margin: 0;
    color: var(--tao-color-text-muted);
}

.progress {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--tao-color-text-muted);
    font-size: var(--tao-font-size-xs);
}
</style>

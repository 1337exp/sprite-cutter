<script setup lang="ts">
import { TaoButton, TaoFileDrop, TaoSegmented, TaoSegmentedOption, TaoTabs, TaoThemeToggle, toast } from '@1337exp/taoui';
import { computed, onBeforeUnmount, provide, ref, watch } from 'vue';
import BackgroundKeys from './components/BackgroundKeys.vue';
import ExportPanel from './components/ExportPanel.vue';
import SearchSettings from './components/SearchSettings.vue';
import SheetViewport from './components/SheetViewport.vue';
import SpriteList from './components/SpriteList.vue';
import { i18n, locale, t } from './i18n';
import { mode, type Mode } from './theme';
import { createWorkspace, WORKSPACE } from './workspace';

const workspace = createWorkspace();
provide(WORKSPACE, workspace);
onBeforeUnmount(workspace.dispose);

const { sheet, entries, hovered, picking, keys, openFile, openExample, toggle, setHovered, pickColor } = workspace;

// ---- opening a file ---------------------------------------------------------------------------------------

// The drop zone only hands files over: it is emptied at once, so it is ready for the next one.
// Зона загрузки только передаёт файлы дальше: её сразу опустошаем, чтобы она была готова к следующему.
const files = ref<File[]>([]);

watch(files, (list) => {
    const file = list[0];
    if (!file) return;
    files.value = [];
    void openFile(file);
});

function onReject(): void {
    toast().danger().message(t('open.notImage'));
}

// ---- the side panel ---------------------------------------------------------------------------------------

const tab = ref('search');
const tabs = computed(() => [
    { value: 'search', label: t('tabs.search') },
    { value: 'background', label: keys.value.length ? `${t('tabs.background')} (${keys.value.length})` : t('tabs.background') },
]);

const info = computed(() => {
    const current = sheet.value;
    if (!current) return '';

    const parts = [current.fileName, t('sheet.size', [current.image.width, current.image.height])];
    if (current.gifFrames) parts.push(t('sheet.gif', [current.gifFrames]));
    return parts.join(' · ');
});

// ---- the switches -----------------------------------------------------------------------------------------

function setLanguage(value: string | number | boolean): void {
    const code = String(value);
    if (i18n.isLocaleCode(code)) i18n.setLocale(code);
}

function setMode(value: Mode): void {
    mode.value = value;
}
</script>

<template>
    <div class="app">
        <header class="top">
            <div class="brand">
                <h1>{{ t('app.title') }}</h1>
                <p>{{ t('app.tagline') }}</p>
            </div>

            <div class="switches">
                <TaoSegmented :model-value="locale" size="small" :aria-label="t('app.language')" @update:model-value="setLanguage">
                    <TaoSegmentedOption v-for="code in i18n.codes" :key="code" :value="code" :label="code.toUpperCase()" />
                </TaoSegmented>
                <TaoThemeToggle :model-value="mode" :apply="false" size="small" @update:model-value="setMode" />
            </div>
        </header>

        <main class="main">
            <section class="stage">
                <div class="open">
                    <TaoFileDrop v-model="files" class="drop" accept="image/*" size="small" :list="false" @reject="onReject">
                        {{ t('open.drop') }}
                    </TaoFileDrop>
                    <TaoButton variant="secondary" @click="openExample">{{ t('open.example') }}</TaoButton>
                </div>

                <SheetViewport
                    class="view"
                    :sheet="sheet"
                    :entries="entries"
                    :hovered="hovered"
                    :picking="picking"
                    @toggle="toggle"
                    @hover="setHovered"
                    @pick="pickColor"
                    @open="openFile"
                />

                <p class="hint">{{ picking ? t('viewport.picking') : t('viewport.hint') }}</p>
                <p v-if="info" class="info">{{ info }}</p>
            </section>

            <aside class="side tao-size-small">
                <section class="panel">
                    <TaoTabs v-model="tab" :items="tabs">
                        <SearchSettings v-if="tab === 'search'" />
                        <BackgroundKeys v-else />
                    </TaoTabs>
                </section>

                <SpriteList />
                <ExportPanel />
            </aside>
        </main>
    </div>
</template>

<style scoped>
.app {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
}

.top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--tao-color-border);
}

.brand h1 {
    margin: 0;
    font-size: var(--tao-font-size-xl);
}

.brand p {
    margin: 2px 0 0;
    color: var(--tao-color-text-muted);
    font-size: var(--tao-font-size-xs);
}

.switches {
    display: flex;
    align-items: center;
    gap: 8px;
}

.main {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr) 400px;
    gap: 16px;
    min-height: 0;
    padding: 16px;
}

.stage {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
}

.open {
    display: flex;
    align-items: stretch;
    gap: 8px;
}

.drop {
    flex: 1;
    min-width: 0;
}

.view {
    flex: 1;
    min-height: 360px;
}

.hint,
.info {
    margin: 0;
    color: var(--tao-color-text-muted);
    font-size: var(--tao-font-size-xs);
}

.info {
    font-family: var(--tao-font-family-mono, monospace);
}

.side {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
}

@media (min-width: 901px) {
    .app {
        height: 100dvh;
    }

    .main {
        overflow: hidden;
    }

    .side {
        overflow-y: auto;
        padding-right: 4px;
    }
}

@media (max-width: 900px) {
    .main {
        grid-template-columns: minmax(0, 1fr);
    }

    .view {
        flex: none;
        height: 60vh;
    }
}
</style>

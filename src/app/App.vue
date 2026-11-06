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

const { sheet, entries, hovered, picking, finding, cutMode, framesMode, keys, selected, exporting, openFile, openExample, toggle, setHovered, clickAt, setAll, downloadZip } =
    workspace;

const viewport = ref<InstanceType<typeof SheetViewport> | null>(null);

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

function setCut(value: string | number | boolean): void {
    cutMode.value = value === 'search' ? 'search' : 'frames';
}

// ---- the keyboard -----------------------------------------------------------------------------------------

// `code`, not `key`: the letters work on any keyboard layout.
// `code`, а не `key`: буквы работают в любой раскладке.
function onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat || event.altKey) return;

    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role=dialog], [role=alertdialog]')) return;

    const withCtrl = event.ctrlKey || event.metaKey;

    if (withCtrl && !event.shiftKey) {
        if (event.code === 'KeyA') {
            event.preventDefault();
            if (entries.value.length) setAll(true);
        } else if (event.code === 'KeyS') {
            event.preventDefault();
            if (selected.value.length && !exporting.running) void downloadZip();
        }
        return;
    }
    if (withCtrl || event.shiftKey) return;

    switch (event.code) {
        case 'KeyF':
            viewport.value?.fit();
            break;
        case 'Digit1':
            viewport.value?.actual();
            break;
        case 'KeyI':
            if (sheet.value) picking.value = !picking.value;
            break;
        case 'KeyP':
            if (sheet.value && !framesMode.value) finding.value = !finding.value;
            break;
        case 'Escape':
            picking.value = false;
            finding.value = false;
            break;
        default:
            return;
    }
    event.preventDefault();
}

window.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
    <div class="app tao-density-auto">
        <header class="top">
            <div class="brand">
                <h1>{{ t('app.title') }}</h1>
                <p>{{ t('app.tagline') }}</p>
            </div>

            <div class="switches">
                <TaoSegmented :model-value="locale" :aria-label="t('app.language')" @update:model-value="setLanguage">
                    <TaoSegmentedOption v-for="code in i18n.codes" :key="code" :value="code" :label="code.toUpperCase()" />
                </TaoSegmented>
                <TaoThemeToggle :model-value="mode" :apply="false" @update:model-value="setMode" />
            </div>
        </header>

        <main class="main">
            <section class="stage">
                <div class="open">
                    <TaoFileDrop v-model="files" class="drop" accept="image/*" :list="false" @reject="onReject">
                        {{ t('open.drop') }}
                    </TaoFileDrop>
                    <TaoButton variant="secondary" @click="openExample">{{ t('open.example') }}</TaoButton>
                </div>

                <SheetViewport
                    ref="viewport"
                    class="view"
                    :sheet="sheet"
                    :entries="entries"
                    :hovered="hovered"
                    :picking="picking || finding"
                    @toggle="toggle"
                    @hover="setHovered"
                    @pick="clickAt"
                    @open="openFile"
                />

                <p class="hint">{{ picking ? t('viewport.picking') : finding ? t('viewport.finding') : t('viewport.hint') }}</p>
                <p class="hint keys">{{ t('keys') }}</p>
                <p v-if="info" class="info">{{ info }}</p>
            </section>

            <aside class="side">
                <section class="panel">
                    <TaoSegmented v-if="sheet?.cells" class="cut" :model-value="cutMode" :aria-label="t('cut.label')" @update:model-value="setCut">
                        <TaoSegmentedOption value="frames" :label="t('cut.frames')" />
                        <TaoSegmentedOption value="search" :label="t('cut.search')" />
                    </TaoSegmented>

                    <p v-if="framesMode" class="note">{{ t('cut.framesNote') }}</p>
                    <TaoTabs v-else v-model="tab" :items="tabs">
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

.cut {
    margin-bottom: 12px;
}

.note {
    margin: 0;
    color: var(--tao-color-text-muted);
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

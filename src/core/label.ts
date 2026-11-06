/**
 * Grows every marked pixel `reach` pixels to the right and down (a square of side `reach + 1`). Two pixels
 * that are at most `reach` empty pixels apart, in either direction, end up with touching squares, so the
 * labelling below joins them. Doing it as two sweeps (along the rows, then down the columns) costs O(w·h)
 * whatever `reach` is.
 * Растит каждый отмеченный пиксель на `reach` пикселей вправо и вниз (квадрат со стороной `reach + 1`).
 * Два пикселя, между которыми не больше `reach` пустых, в любом направлении, получают касающиеся квадраты,
 * и разметка ниже их склеит. Два прохода (по строкам, потом по столбцам) стоят O(w·h) при любом `reach`.
 */
export function dilate(mask: Uint8Array, w: number, h: number, reach: number): Uint8Array {
    const out = new Uint8Array(w * h);

    for (let y = 0; y < h; y++) {
        const row = y * w;
        let last = -reach - 1;
        for (let x = 0; x < w; x++) {
            if (mask[row + x]) last = x;
            if (x - last <= reach) out[row + x] = 1;
        }
    }

    // In place: a cell is read before it may be written, and only cells above it ever feed `lastRow`.
    // На месте: клетка читается раньше, чем её могут записать, а `lastRow` питают только клетки выше.
    const lastRow = new Int32Array(w).fill(-reach - 1);
    for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
            if (out[row + x]) lastRow[x] = y;
            else if (y - lastRow[x]! <= reach) out[row + x] = 1;
        }
    }

    return out;
}

export interface Labels {
    /**
     * Component number of every pixel, 1…`count`; 0 is background. Numbers follow the reading order of
     * each component's first pixel.
     * Номер компоненты у каждого пикселя, 1…`count`; 0 — фон. Номера идут в порядке чтения первого
     * пикселя каждой компоненты.
     */
    labels: Int32Array;
    count: number;
}

/**
 * Connected components of a mask, diagonal neighbours included (8-connectivity), in two passes with a
 * union-find. O(w·h) time, no recursion, no per-pixel allocation.
 * Связные компоненты маски, с диагональными соседями (8-связность), два прохода с union-find.
 * O(w·h) по времени, без рекурсии и без выделения памяти на пиксель.
 */
export function labelComponents(mask: Uint8Array, w: number, h: number): Labels {
    const labels = new Int32Array(w * h);

    // A pixel starts a new provisional label only when none of its four earlier neighbours is marked.
    // Two such pixels are never neighbours of each other, so there are at most ⌈w/2⌉·⌈h/2⌉ of them.
    // Пиксель заводит новую черновую метку, только если ни один из четырёх прежних соседей не отмечен.
    // Два таких пикселя никогда не соседи, поэтому их не больше ⌈w/2⌉·⌈h/2⌉.
    const parent = new Int32Array(((w + 1) >> 1) * ((h + 1) >> 1) + 2);
    let next = 1;

    const find = (a: number): number => {
        while (parent[a] !== a) {
            parent[a] = parent[parent[a]!]!;
            a = parent[a]!;
        }
        return a;
    };

    // The smaller root always wins, so a component's root is its earliest label.
    // Побеждает всегда меньший корень, поэтому корень компоненты — её самая ранняя метка.
    const union = (a: number, b: number): number => {
        const ra = find(a);
        const rb = find(b);
        if (ra === rb) return ra;
        if (ra < rb) {
            parent[rb] = ra;
            return ra;
        }
        parent[ra] = rb;
        return rb;
    };

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (mask[i] === 0) continue;

            const west = x > 0 ? labels[i - 1]! : 0;
            let northWest = 0;
            let north = 0;
            let northEast = 0;
            if (y > 0) {
                const up = i - w;
                north = labels[up]!;
                if (x > 0) northWest = labels[up - 1]!;
                if (x < w - 1) northEast = labels[up + 1]!;
            }

            let label = 0;
            if (west) label = west;
            if (northWest && (label === 0 || northWest < label)) label = northWest;
            if (north && (label === 0 || north < label)) label = north;
            if (northEast && (label === 0 || northEast < label)) label = northEast;

            if (label === 0) {
                parent[next] = next;
                labels[i] = next++;
                continue;
            }

            if (west) label = union(label, west);
            if (northWest) label = union(label, northWest);
            if (north) label = union(label, north);
            if (northEast) label = union(label, northEast);
            labels[i] = label;
        }
    }

    // Roots are visited in ascending order and a root is never larger than its members, so by the time a
    // label looks up its root's final number, that number is already set.
    // Корни обходятся по возрастанию, а корень не больше своих членов, поэтому к моменту, когда метка
    // ищет итоговый номер корня, он уже выставлен.
    const final = new Int32Array(next);
    let count = 0;
    for (let l = 1; l < next; l++) {
        const root = find(l);
        final[l] = root === l ? ++count : final[root]!;
    }

    for (let i = 0; i < labels.length; i++) {
        const l = labels[i]!;
        if (l !== 0) labels[i] = final[l]!;
    }

    return { labels, count };
}

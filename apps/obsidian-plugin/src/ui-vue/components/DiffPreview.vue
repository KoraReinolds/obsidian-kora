<script setup lang="ts">
/**
 * @description Универсальный word-diff preview для сравнения двух текстов.
 */
import { computed } from 'vue';

const props = withDefaults(
	defineProps<{
		previous: string;
		current: string;
	}>(),
	{
		previous: '',
		current: '',
	}
);

interface DiffPart {
	type: 'equal' | 'add' | 'del';
	text: string;
}

/**
 * @description Токенизация текста с сохранением пробелов.
 * @param {string} text - Исходная строка.
 * @returns {string[]} Массив токенов.
 */
const tokenize = (text: string): string[] => {
	return (text || '').split(/(\s+)/).filter(Boolean);
};

/**
 * @description LCS diff по словам.
 * @param {string} oldText - Предыдущее значение.
 * @param {string} newText - Текущее значение.
 * @returns {DiffPart[]} Последовательность сегментов.
 */
const diffWords = (oldText: string, newText: string): DiffPart[] => {
	const a = tokenize(oldText);
	const b = tokenize(newText);
	const al = a.length;
	const bl = b.length;
	const dp: number[][] = Array.from({ length: al + 1 }, () =>
		Array(bl + 1).fill(0)
	);

	for (let i = al - 1; i >= 0; i--) {
		for (let j = bl - 1; j >= 0; j--) {
			dp[i][j] =
				a[i] === b[j]
					? 1 + dp[i + 1][j + 1]
					: Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}

	const parts: DiffPart[] = [];
	let i = 0;
	let j = 0;
	while (i < al && j < bl) {
		if (a[i] === b[j]) {
			parts.push({ type: 'equal', text: a[i] });
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			parts.push({ type: 'del', text: a[i++] });
		} else {
			parts.push({ type: 'add', text: b[j++] });
		}
	}
	while (i < al) parts.push({ type: 'del', text: a[i++] });
	while (j < bl) parts.push({ type: 'add', text: b[j++] });

	const collapsed: DiffPart[] = [];
	for (const part of parts) {
		const last = collapsed[collapsed.length - 1];
		if (last && last.type === part.type) {
			last.text += part.text;
		} else {
			collapsed.push({ ...part });
		}
	}

	return collapsed;
};

const parts = computed(() => diffWords(props.previous, props.current));
</script>

<template>
	<div
		class="rounded-md border border-solid border-[var(--background-modifier-border)] bg-[var(--background-primary)] p-2 text-xs leading-relaxed"
	>
		<span
			v-for="(part, index) in parts"
			:key="`${part.type}-${index}`"
			:class="[
				part.type === 'equal' ? '' : '',
				part.type === 'add'
					? 'rounded px-0.5 text-[var(--color-green)] bg-[var(--color-green)]/15'
					: '',
				part.type === 'del'
					? 'rounded px-0.5 text-[var(--color-red)] bg-[var(--color-red)]/15 line-through'
					: '',
			]"
			v-text="part.text"
		/>
	</div>
</template>

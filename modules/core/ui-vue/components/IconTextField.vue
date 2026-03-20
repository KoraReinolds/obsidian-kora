<script setup lang="ts">
/**
 * @description Текстовое поле с ведущей иконкой: flex-ряд (иконка | ввод), без absolute — текст не заезжает на иконку при глобальных стилях Obsidian для `input`.
 * Колонка иконки без фиксированной ширины (`w-8` и т.п.), иначе центрирование даёт пустоту между иконкой и полем.
 */
import UiHostIcon from './UiHostIcon.vue';

const props = withDefaults(
	defineProps<{
		/** Стили внешнего контейнера (рамка, фон, focus-within и т.д.). */
		inputClass: string;
		icon: string;
		iconLabel: string;
		placeholder?: string;
		/** Если true — Enter эмитит `enter` (синк peer и т.п.). */
		submitOnEnter?: boolean;
	}>(),
	{ submitOnEnter: false }
);

const model = defineModel<string>({ required: true });

const emit = defineEmits<{
	/** Enter в поле при `submitOnEnter`. */
	enter: [];
}>();

/**
 * @description Обработка Enter только когда включён submit.
 * @param {KeyboardEvent} event - Событие клавиатуры.
 * @returns {void}
 */
const onEnterKey = (event: KeyboardEvent): void => {
	if (!props.submitOnEnter) {
		return;
	}
	event.preventDefault();
	emit('enter');
};
</script>

<template>
	<div
		class="kora-icon-text-field flex min-h-8 min-w-0 flex-1 items-center gap-0 overflow-hidden"
		:class="inputClass"
	>
		<div
			class="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--text-muted)]"
			aria-hidden="true"
		>
			<UiHostIcon
				:name="icon"
				:label="iconLabel"
				icon-class="!h-3.5 !w-3.5 shrink-0 [&>svg]:!h-3.5 [&>svg]:!w-3.5 [&>svg]:opacity-80"
			/>
		</div>
		<input
			v-model="model"
			type="text"
			class="kora-icon-text-field__input min-w-0 flex-1 appearance-none border-0 bg-transparent py-0 pl-0 pr-2 text-sm leading-5 text-[var(--text-normal)] !shadow-none !ring-0 outline-none placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:!ring-0"
			:placeholder="placeholder"
			@keydown.enter="onEnterKey"
		/>
	</div>
</template>

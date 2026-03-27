<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		src?: string | null;
		isImage?: boolean;
		isVideo?: boolean;
		zoomable?: boolean;
	}>(),
	{
		src: null,
		isImage: true,
		isVideo: false,
		zoomable: false,
	}
);

const emit = defineEmits<{
	(event: 'open', src: string): void;
}>();

const handleOpen = (): void => {
	if (!props.src) {
		return;
	}
	emit('open', props.src);
};
</script>

<template>
	<div
		class="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-solid border-[rgba(255,255,255,0.1)] bg-black/20"
	>
		<img
			v-if="isImage && src"
			:src="src"
			alt=""
			class="h-full w-full object-cover"
			:class="zoomable ? 'cursor-zoom-in' : ''"
			@click="zoomable ? handleOpen() : undefined"
		/>
		<video
			v-else-if="isVideo && src"
			:src="src"
			class="h-full w-full object-cover"
			controls
			playsinline
		/>
	</div>
</template>

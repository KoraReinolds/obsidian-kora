<script setup lang="ts">
/**
 * @description Минимальный non-archive экран для проверки повторного использования core компонентов.
 */
import { AppShell, StatusBanner } from '../../../core/ui-vue';
</script>

<template>
	<AppShell title="Ping Feature">
		<StatusBanner kind="success" text="Core UI reused outside archive feature." />
	</AppShell>
</template>

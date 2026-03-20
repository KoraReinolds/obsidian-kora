/**
 * @module core/ui-vue/injection-keys
 *
 * @description Ключи provide/inject для подстановки host-специфичных реализаций (иконки и т.д.)
 * без зависимости core от Obsidian.
 */

import type { Component, InjectionKey } from 'vue';

/**
 * @description Компонент отрисовки Lucide-иконки через host (например {@link setIcon} в Obsidian).
 */
export const HOST_LUCIDE_ICON: InjectionKey<Component> = Symbol('koraHostLucideIcon');

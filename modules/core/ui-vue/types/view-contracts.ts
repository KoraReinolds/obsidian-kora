/**
 * @module core/ui-vue/types/view-contracts
 *
 * @description Базовые контракты core-first архитектуры для Vue экранов:
 * состояние, действия, сообщения и lifecycle host-монтажа.
 */

/**
 * @description Тип сообщения для экранного status banner.
 */
export type TScreenMessageKind =
	| 'neutral'
	| 'success'
	| 'error'
	| 'warning'
	| 'info';

/**
 * @description Сообщение, которое отображается в верхней части экрана.
 */
export interface ScreenMessage {
	kind: TScreenMessageKind;
	text: string;
}

/**
 * @description Обобщённый контракт состояния любого Vue-экрана.
 */
export interface ScreenState<TData = unknown> {
	isLoading: boolean;
	message: ScreenMessage | null;
	data: TData;
}

/**
 * @description Обобщённый контракт действий и обработчиков экрана.
 */
export interface ScreenActions<TParams = void> {
	refresh(params?: TParams): Promise<void>;
}

/**
 * @description Порт доступа к данным. Реализация определяется feature-слоем.
 */
export interface BaseTransportPort {
	isReachable?(): Promise<boolean>;
}

/**
 * @description Контекст монтирования Vue-приложения в host окружении.
 */
export interface HostMountContext<TProps> {
	container: HTMLElement;
	props: TProps;
}

/**
 * @description Контекст размонтирования Vue-приложения в host окружении.
 */
export interface HostUnmountContext {
	container: HTMLElement;
}

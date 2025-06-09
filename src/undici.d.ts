// Fix some broken types in Undici
import type { Buffer } from 'node:buffer'
import type { Dispatcher } from 'undici'

declare module 'undici' {
	export declare class DecoratorHandler implements Dispatcher.DispatchHandler {
		constructor(handler: Dispatcher.DispatchHandler)
		// The below are missing from the type definitions in Undici
		onRequestStart?(controller: DispatchController, context: any): void
		onRequestUpgrade?(controller: DispatchController, statusCode: number, headers: IncomingHttpHeaders, socket: Duplex): void
		onResponseStart?(controller: DispatchController, statusCode: number, headers: IncomingHttpHeaders, statusMessage?: string): void
		onResponseData?(controller: DispatchController, chunk: Buffer): void // eslint-disable-line @typescript-eslint/ban-types
		onResponseEnd?(controller: DispatchController, trailers: IncomingHttpHeaders): void
		onResponseError?(controller: DispatchController, error: Error): void
	}
}

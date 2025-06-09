import { Agent, interceptors } from 'undici'
import { getMockDispatcher } from './mocking/index.js'


// Interceptors to add response caching, DNS caching and retrying to the dispatcher
const { cache, dns, retry } = interceptors

export const defaultDispatcher = new Agent({
	connections: 1000, // https://github.com/nodejs/undici/issues/3221
	connectTimeout: 60_000,
	headersTimeout: 60_000,
	bodyTimeout: 60_000,
}).compose(cache(), dns(), retry())


/**
 * Return the dispatcher that should be used for HTTP requests.
 * @param {string} url
 * @param {Parameters<undiciRequest>[1] | Parameters<undiciFetch>[1]} options
 */
export function getDispatcher(url, options) {
	if (isMockingEnabled()) {
		return getMockDispatcher(url, options)
	}

	return defaultDispatcher
}

import { request as undiciRequest, fetch as undiciFetch } from 'undici'


/**
 * Make an HTTP request using the Undici library’s `request`.
 * Use either the default dispatcher or the mock dispatcher.
 * @param {Parameters<undiciRequest>[0]} url
 * @param {Parameters<undiciRequest>[1]} [options]
 */
export function requestWithCustomDispatcher(url, options = {}) {
	return undiciRequest(url, { ...options, dispatcher: getDispatcher(`${url}`, options) })
}

/**
 * Make an HTTP request using the Undici library’s `fetch`.
 * Use either the default dispatcher or the mock dispatcher.
 * @param {Parameters<undiciFetch>[0]} url
 * @param {Parameters<undiciFetch>[1]} [options]
 */
export function fetchWithCustomDispatcher(url, options = {}) {
	return undiciFetch(url, { ...options, dispatcher: getDispatcher(`${url}`, options) })
}

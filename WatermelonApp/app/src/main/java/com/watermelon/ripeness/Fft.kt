package com.watermelon.ripeness

import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** 基2 快速傅里叶变换，输入加 hamming 窗，输出单边频谱幅值 */
class Fft(private val n: Int) {

    private val levels: Int = Integer.numberOfTrailingZeros(n)
    private val rev = IntArray(n)
    private val cosT = DoubleArray(n)
    private val sinT = DoubleArray(n)

    init {
        require(Integer.bitCount(n) == 1) { "n 必须是 2 的幂" }
        for (i in 0 until n) {
            var r = 0
            for (j in 0 until levels) r = (r shl 1) or ((i ushr j) and 1)
            rev[i] = r
        }
        for (i in 0 until n) {
            val a = -2.0 * Math.PI * i / n
            cosT[i] = cos(a)
            sinT[i] = sin(a)
        }
    }

    fun fftMag(input: ShortArray): DoubleArray {
        val re = DoubleArray(n)
        val im = DoubleArray(n)
        for (i in 0 until n) {
            val w = 0.54 - 0.46 * cos(2.0 * Math.PI * i / (n - 1)) // hamming 窗
            re[rev[i]] = input[i].toDouble() * w
        }
        runFFT(re, im)
        val mag = DoubleArray(n / 2)
        for (i in 0 until n / 2) mag[i] = sqrt(re[i] * re[i] + im[i] * im[i])
        return mag
    }

    private fun runFFT(re: DoubleArray, im: DoubleArray) {
        var size = 2
        while (size <= n) {
            val half = size shr 1
            val step = n / size
            var i = 0
            while (i < n) {
                for (j in 0 until half) {
                    val k = j * step
                    val tr = re[i + j + half] * cosT[k] - im[i + j + half] * sinT[k]
                    val ti = re[i + j + half] * sinT[k] + im[i + j + half] * cosT[k]
                    re[i + j + half] = re[i + j] - tr
                    im[i + j + half] = im[i + j] - ti
                    re[i + j] += tr
                    im[i + j] += ti
                }
                i += size
            }
            size = size shl 1
        }
    }
}
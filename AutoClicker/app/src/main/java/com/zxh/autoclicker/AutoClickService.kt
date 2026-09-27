package com.zxh.autoclicker

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent

/**
 * 无障碍连点服务。通过 performGesture 在指定坐标以设定频率执行点击。
 */
class AutoClickService : AccessibilityService() {

    companion object {
        private const val TAG = "AutoClick"

        @Volatile private var service: AutoClickService? = null

        var running = false
            private set
        var x = 0f
            private set
        var y = 0f
            private set
        var intervalMs = 1000L
            private set

        /** 状态回调，用于刷新界面显示。 */
        var statusListener: ((String) -> Unit)? = null

        fun configure(tapX: Float, tapY: Float, ms: Long) {
            x = tapX
            y = tapY
            intervalMs = if (ms < 50) 50 else ms
        }

        fun isEnabled(): Boolean = service != null

        fun start() {
            val s = service ?: return
            if (running) return
            running = true
            s.beginLoop()
        }

        fun stop() {
            running = false
            service?.stopLoop()
            statusListener?.invoke("已停止")
        }
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    private val clickRunnable = object : Runnable {
        override fun run() {
            if (!running) return
            performTap()
            mainHandler.postDelayed(this, intervalMs)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        service = this
        Log.i(TAG, "service connected")
        statusListener?.invoke("无障碍服务已连接")
    }

    override fun onDestroy() {
        running = false
        mainHandler.removeCallbacks(clickRunnable)
        if (service === this) service = null
        statusListener?.invoke("服务已断开")
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // 连点不依赖事件内容
    }

    override fun onInterrupt() {
        stopLoop()
    }

    private fun beginLoop() {
        mainHandler.removeCallbacks(clickRunnable)
        performTap()
        mainHandler.postDelayed(clickRunnable, intervalMs)
        statusListener?.invoke("开始连点：(${x.toInt()}, ${y.toInt()})，间隔 ${intervalMs}ms")
    }

    private fun stopLoop() {
        mainHandler.removeCallbacks(clickRunnable)
    }

    private fun performTap() {
        try {
            val path = Path()
            path.moveTo(x, y)
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, 50))
                .build()
            dispatchGesture(gesture, null, null)
        } catch (e: Exception) {
            Log.w(TAG, "performGesture failed", e)
        }
    }
}
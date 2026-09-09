<template>
  <div class="hub-page">
    <PageHeader title="教学运营" />
    <el-tabs v-model="activeTab" class="hub-tabs" @tab-change="syncUrl">
      <el-tab-pane v-for="t in visibleTabs" :key="t.key" :name="t.key" :label="t.label">
        <component v-if="activeTab === t.key" :is="t.comp" :embedded="true" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import ClassesView from '@/views/classes/index.vue'
import ScheduleView from '@/views/schedule/index.vue'
import CheckinView from '@/views/checkin/index.vue'
import LeaveView from '@/views/leave/index.vue'
import MakeupView from '@/views/makeup/index.vue'
import AttendanceRecordsView from '@/views/attendance-records/index.vue'
import { usePerm } from '@/composables/usePerm'

const route = useRoute()
const router = useRouter()
const { role, has } = usePerm()

const tabs = [
  { key: 'classes', label: '课程', comp: ClassesView, roles: ['admin'], perm: 'courses' },
  { key: 'schedule', label: '排期', comp: ScheduleView, roles: ['admin', 'coach'], perm: 'schedule' },
  { key: 'checkin', label: '签到', comp: CheckinView, roles: ['admin', 'coach'], perm: 'checkin' },
  { key: 'leave', label: '请假', comp: LeaveView, roles: ['admin', 'coach'], perm: 'leave' },
  { key: 'attendance', label: '上课记录', comp: AttendanceRecordsView, roles: ['admin', 'coach'], perm: 'checkin' },
  { key: 'makeup', label: '补课/调课', comp: MakeupView, roles: ['admin', 'coach'], perm: 'schedule' },
]
const visibleTabs = computed(() => tabs.filter((t) => t.roles.includes(role.value) || has(t.perm)))
const activeTab = ref('schedule')

const syncUrl = () => router.replace({ query: { ...route.query, tab: activeTab.value } })
onMounted(() => {
  const tab = route.query.tab
  if (tab && visibleTabs.value.some((t) => t.key === tab)) activeTab.value = tab
  else if (visibleTabs.value.length && !visibleTabs.value.some((t) => t.key === activeTab.value)) {
    activeTab.value = visibleTabs.value[0].key
  }
})
watch(route, (r) => {
  const tab = r.query.tab
  if (tab && visibleTabs.value.some((t) => t.key === tab)) activeTab.value = tab
})
</script>

<style scoped>
.hub-tabs :deep(.el-tabs__header) {
  margin-bottom: var(--t-spacing-lg);
}
</style>

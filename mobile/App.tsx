import { useEffect } from 'react'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { Amplify } from 'aws-amplify'
import { Authenticator } from '@aws-amplify/react-native'

import { LiveScreen } from './src/screens/LiveScreen'
import { EventsScreen } from './src/screens/EventsScreen'
import { SearchScreen } from './src/screens/SearchScreen'
import { AlertsScreen } from './src/screens/AlertsScreen'
import {
  registerForPushNotifications,
  addNotificationListener,
} from './src/lib/notifications'

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.EXPO_PUBLIC_USER_POOL_ID ?? '',
      userPoolClientId: process.env.EXPO_PUBLIC_USER_POOL_CLIENT_ID ?? '',
      loginWith: { email: true },
    },
  },
})

const Tab = createBottomTabNavigator()

const DarkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#12141a',
    card: '#1a1d24',
    text: '#f1f5f9',
    border: '#22262f',
    primary: '#f59e0b',
  },
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const TAB_ICONS: Record<string, [IoniconName, IoniconName]> = {
  Live:    ['videocam', 'videocam-outline'],
  Events:  ['list', 'list-outline'],
  Search:  ['search', 'search-outline'],
  Alerts:  ['alert-circle', 'alert-circle-outline'],
}

export default function App() {
  useEffect(() => {
    registerForPushNotifications()
    const sub = addNotificationListener((notification) => {
      console.log('Push notification received:', notification)
    })
    return () => sub.remove()
  }, [])

  return (
    <Authenticator.Provider>
      <Authenticator>
        <NavigationContainer theme={DarkTheme}>
          <StatusBar style="light" />
          <Tab.Navigator
            screenOptions={({ route }) => ({
              tabBarIcon: ({ focused, color, size }) => {
                const [active, inactive] = TAB_ICONS[route.name] ?? ['help', 'help-outline']
                return <Ionicons name={focused ? active : inactive} size={size} color={color} />
              },
              tabBarActiveTintColor: '#f59e0b',
              tabBarInactiveTintColor: '#475569',
              tabBarStyle: { backgroundColor: '#1a1d24', borderTopColor: '#22262f' },
              headerStyle: { backgroundColor: '#1a1d24' },
              headerTintColor: '#f1f5f9',
              headerTitleStyle: { fontWeight: '600' },
            })}
          >
            <Tab.Screen name="Live"   component={LiveScreen}   />
            <Tab.Screen name="Events" component={EventsScreen} />
            <Tab.Screen name="Search" component={SearchScreen} />
            <Tab.Screen name="Alerts" component={AlertsScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </Authenticator>
    </Authenticator.Provider>
  )
}

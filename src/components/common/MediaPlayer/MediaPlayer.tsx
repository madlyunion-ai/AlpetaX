import Button from '@/components/common/Button/Button'
import Icon from '@/components/common/Icon/Icon'
import './MediaPlayer.scss'

function MediaPlayer() {
  return (
    <div className="media-player">
      <div className="thumbnail">
        <img src={`${import.meta.env.BASE_URL}images/temp/temp_video_thumb.png`} alt="" />
        <Button isOnlyIcon>
          <Icon name="play-line"></Icon>
        </Button>
      </div>
      {/* 컨트롤러 영역 */}
      <div className="controller"></div>
    </div>
  )
}

export default MediaPlayer
